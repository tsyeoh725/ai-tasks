// Action Executor — ported from jarvis/src/lib/agents/action-executor.ts
// Executes approved recommendations against Meta, then updates the
// decisionJournal row with action_taken and action_result.
import { db } from "@/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { v4 as uuid } from "uuid";
// NOTE: Expected camelCase Drizzle tables (added by the parallel schema task):
//   decisionJournal, metaAds, metaAdSets, metaCampaigns, brands, globalSettings,
//   adDailyInsights, marketingAuditLog.
import {
  decisionJournal,
  metaAds,
  metaAdSets,
  metaCampaigns,
  brands,
  globalSettings,
  adDailyInsights,
  marketingAuditLog,
} from "@/db/schema";
import * as metaApi from "@/lib/marketing/meta-api";
import { log } from "@/lib/marketing/logger";
import type {
  BrandConfig,
  Recommendation,
  RecommendationAction,
} from "@/lib/marketing/claude-guard";

export interface ActionResult {
  success: boolean;
  action: RecommendationAction;
  metaAdId?: string;
  metaAdSetId?: string;
  metaCampaignId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  error?: string;
}

// --- Internal helpers ---

async function logAudit(
  eventType: string,
  recommendation: Recommendation,
  result: ActionResult,
): Promise<void> {
  try {
    // Resolve owning user via the brand on this recommendation (marketingAuditLog is user-scoped).
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, recommendation.brandId) });
    if (!brand) {
      console.error("[ACTION_EXECUTOR] audit skipped — brand not found:", recommendation.brandId);
      return;
    }
    await db.insert(marketingAuditLog).values({
      id: uuid(),
      userId: brand.userId,
      eventType,
      entityType: "ad",
      entityId: recommendation.adId,
      payload: JSON.stringify({
        brandId: recommendation.brandId,
        action: recommendation.action,
        adName: recommendation.adName,
        result,
      }),
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[ACTION_EXECUTOR] audit log insert failed:", err);
  }
}

/**
 * Resolve the Meta access token for a brand.
 *
 * FLAGGED: the current `brands` schema does NOT have a `metaAccessToken`
 * column. Until one is added, we fall back to the `META_ACCESS_TOKEN` env
 * var (same as Jarvis). Once the schema gains a per-brand token column, this
 * helper can be tightened to require it.
 */
async function getAccessTokenForBrand(brandId: string): Promise<string> {
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) throw new Error(`Brand not found: ${brandId}`);
  const brandToken = (brand as unknown as { metaAccessToken?: string | null }).metaAccessToken;
  if (brandToken) return brandToken;

  const envToken = process.env.META_ACCESS_TOKEN;
  if (!envToken) {
    throw new Error(
      `No Meta access token for brand ${brandId} (no metaAccessToken column yet, and META_ACCESS_TOKEN env not set)`,
    );
  }
  return envToken;
}

async function executeKillOrPause(
  recommendation: Recommendation,
  accessToken: string,
): Promise<ActionResult> {
  if (!recommendation.adId) {
    return { success: false, action: recommendation.action, error: "No adId provided" };
  }

  const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, recommendation.adId) });
  if (!ad) {
    return { success: false, action: recommendation.action, error: "Ad not found in database" };
  }

  const adRow = ad as unknown as { metaAdId: string; status: string };
  const beforeState = { status: adRow.status };
  await metaApi.updateAdStatus(adRow.metaAdId, "PAUSED", accessToken);

  await db.update(metaAds).set({ status: "PAUSED" }).where(eq(metaAds.id, recommendation.adId));

  return {
    success: true,
    action: recommendation.action,
    metaAdId: adRow.metaAdId,
    beforeState,
    afterState: { status: "PAUSED" },
  };
}

async function executeBoostBudget(
  recommendation: Recommendation,
  accessToken: string,
  overrideBudget: number | null = null,
): Promise<ActionResult> {
  if (!recommendation.adSetId) {
    return { success: false, action: "boost_budget", error: "No adSetId provided" };
  }

  const adSet = await db.query.metaAdSets.findFirst({
    where: eq(metaAdSets.id, recommendation.adSetId),
    with: { campaign: true },
  });

  if (!adSet) {
    return { success: false, action: "boost_budget", error: "Ad set not found" };
  }

  const adSetRow = adSet as unknown as {
    metaAdsetId: string; // schema column is lowercase "adset"
    dailyBudget: number | null;
    campaignId: string | null;
    campaign?: {
      id: string;
      metaCampaignId: string;
      dailyBudget: number | null;
      lifetimeBudget: number | null;
    } | null;
  };

  const campaign = adSetRow.campaign;
  const adSetBudget = adSetRow.dailyBudget;
  const campaignDailyBudget = campaign?.dailyBudget ?? null;
  const campaignLifetimeBudget = campaign?.lifetimeBudget ?? null;

  // Operator-typed amount on the approval card overrides the default *1.5
  // projection. null/0/negative falls back to the auto bump so a malformed
  // override can't accidentally zero out a budget.
  const useOverride = overrideBudget !== null && overrideBudget > 0;
  const project = (current: number) =>
    useOverride
      ? Math.round(overrideBudget * 100) / 100
      : Math.round(current * 1.5 * 100) / 100;

  log("info", "action_executor", `Budget check for "${recommendation.adName}"`, {
    adsetBudget: adSetBudget,
    campaignDailyBudget,
    campaignLifetimeBudget,
    overrideBudget,
  });

  if (adSetBudget !== null && adSetBudget > 0) {
    const newBudget = project(adSetBudget);
    const beforeState = { dailyBudget: adSetBudget, level: "ad_set" };
    await metaApi.updateAdSetBudget(adSetRow.metaAdsetId, newBudget, accessToken);
    await db.update(metaAdSets).set({ dailyBudget: newBudget }).where(eq(metaAdSets.id, recommendation.adSetId));
    return {
      success: true,
      action: "boost_budget",
      metaAdSetId: adSetRow.metaAdsetId,
      beforeState,
      afterState: { dailyBudget: newBudget, level: "ad_set", override: useOverride },
    };
  }

  if (campaign && campaignDailyBudget !== null && campaignDailyBudget > 0) {
    const newBudget = project(campaignDailyBudget);
    const beforeState = { dailyBudget: campaignDailyBudget, level: "campaign" };
    await metaApi.updateCampaignBudget(campaign.metaCampaignId, newBudget, "daily", accessToken);
    await db.update(metaCampaigns).set({ dailyBudget: newBudget }).where(eq(metaCampaigns.id, campaign.id));
    return {
      success: true,
      action: "boost_budget",
      metaCampaignId: campaign.metaCampaignId,
      beforeState,
      afterState: { dailyBudget: newBudget, level: "campaign", override: useOverride },
    };
  }

  if (campaign && campaignLifetimeBudget !== null && campaignLifetimeBudget > 0) {
    const newBudget = project(campaignLifetimeBudget);
    const beforeState = { lifetimeBudget: campaignLifetimeBudget, level: "campaign" };
    await metaApi.updateCampaignBudget(campaign.metaCampaignId, newBudget, "lifetime", accessToken);
    await db.update(metaCampaigns).set({ lifetimeBudget: newBudget }).where(eq(metaCampaigns.id, campaign.id));
    return {
      success: true,
      action: "boost_budget",
      metaCampaignId: campaign.metaCampaignId,
      beforeState,
      afterState: { lifetimeBudget: newBudget, level: "campaign", override: useOverride },
    };
  }

  return { success: false, action: "boost_budget", error: "No budget found at ad set or campaign level" };
}

async function executeDuplicate(
  recommendation: Recommendation,
  accessToken: string,
): Promise<ActionResult> {
  if (!recommendation.adId || !recommendation.adSetId) {
    return { success: false, action: "duplicate", error: "No adId or adSetId provided" };
  }

  const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, recommendation.adId) });
  const adSet = await db.query.metaAdSets.findFirst({ where: eq(metaAdSets.id, recommendation.adSetId) });
  if (!ad || !adSet) {
    return { success: false, action: "duplicate", error: "Ad or ad set not found" };
  }

  const metaAdId = (ad as unknown as { metaAdId: string }).metaAdId;
  const metaAdsetId = (adSet as unknown as { metaAdsetId: string }).metaAdsetId;

  const result = await metaApi.duplicateAd(metaAdId, metaAdsetId, accessToken);
  return {
    success: true,
    action: "duplicate",
    metaAdId,
    metaAdSetId: metaAdsetId,
    afterState: { copiedAdId: result?.copied_ad_id },
  };
}

// --- Public API ---

/**
 * Execute a recommendation for a journal entry. Reads the journal row, resolves
 * the recommendation, calls Meta, and writes the result back to the journal.
 */
export async function executeJournalEntry(
  journalId: string,
  options: { manualApproval?: boolean } = {},
): Promise<ActionResult> {
  const entry = await db.query.decisionJournal.findFirst({
    where: eq(decisionJournal.id, journalId),
  });
  if (!entry) {
    throw new Error(`Decision journal entry not found: ${journalId}`);
  }

  const entryRow = entry as unknown as {
    id: string;
    brandId: string;
    adId: string | null;
    adSetId: string | null;
    recommendation: RecommendationAction;
    reason: string;
    kpiValues: string | null;
    guardVerdict: string;
    userOverrideBudget: number | null;
  };

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, entryRow.brandId) });
  if (!brand) throw new Error(`Brand not found: ${entryRow.brandId}`);

  const config = (brand.config ? JSON.parse(brand.config as unknown as string) : null) as BrandConfig | null;
  if (!config) throw new Error(`Brand ${entryRow.brandId} has no config`);

  const kpiValues = entryRow.kpiValues
    ? (JSON.parse(entryRow.kpiValues) as Recommendation["kpiValues"])
    : { cpl: null, ctr: null, frequency: null, spend: 0 };

  const recommendation: Recommendation = {
    brandId: entryRow.brandId,
    brandName: brand.name,
    adId: entryRow.adId,
    adSetId: entryRow.adSetId,
    adName: "",
    action: entryRow.recommendation,
    reason: entryRow.reason,
    kpiValues,
    thresholds: config.thresholds,
  };

  if (entryRow.adId) {
    const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, entryRow.adId) });
    if (ad) recommendation.adName = (ad as unknown as { name: string }).name;
  }

  return executeRecommendation(
    recommendation,
    config,
    journalId,
    options.manualApproval ?? false,
    entryRow.userOverrideBudget,
  );
}

/**
 * Execute a recommendation (after the AI Guard has already approved it, or when
 * a human clicks "approve" on a pending entry).
 */
export async function executeRecommendation(
  recommendation: Recommendation,
  brandConfig: BrandConfig,
  journalId: string,
  manualApproval = false,
  overrideBudget: number | null = null,
): Promise<ActionResult> {
  log(
    "info",
    "action_executor",
    `Executing: ${recommendation.action} on "${recommendation.adName}"`,
    { manualApproval, adId: recommendation.adId, adSetId: recommendation.adSetId },
  );

  // Toggle check (skipped for manual approvals)
  if (!manualApproval) {
    const toggleKey = {
      kill: "killEnabled",
      pause: "killEnabled",
      boost_budget: "budgetEnabled",
      duplicate: "duplicateEnabled",
    }[recommendation.action] as keyof BrandConfig["toggles"];

    if (!brandConfig.toggles[toggleKey]) {
      const result: ActionResult = {
        success: false,
        action: recommendation.action,
        error: `Action type "${recommendation.action}" is disabled for this brand`,
      };
      log("warn", "action_executor", `Toggle off: ${recommendation.action} skipped`, { toggleKey });
      await logAudit("action_skipped_toggle_off", recommendation, result);
      return result;
    }
  }

  // Global pause check — scoped to the brand's owning user since globalSettings is user-scoped.
  const pauseBrand = await db.query.brands.findFirst({ where: eq(brands.id, recommendation.brandId) });
  const pauseSetting = pauseBrand
    ? await db.query.globalSettings.findFirst({
        where: and(eq(globalSettings.userId, pauseBrand.userId), eq(globalSettings.key, "global_pause")),
      })
    : undefined;
  const pauseValueRaw = (pauseSetting as unknown as { value?: string } | undefined)?.value;
  const pauseValue = pauseValueRaw ? safeJsonParse(pauseValueRaw) : false;
  if (pauseValue === true) {
    const result: ActionResult = {
      success: false,
      action: recommendation.action,
      error: "Global pause is active — no actions will be executed",
    };
    await logAudit("action_skipped_global_pause", recommendation, result);
    return result;
  }

  // Spend-limit check (only applies to boost_budget)
  if (recommendation.action === "boost_budget" && brandConfig.spendLimit?.monthlyLimit) {
    const now = new Date();
    // adDailyInsights.date is stored as a yyyy-mm-dd string; compare as strings.
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const daily = await db.query.adDailyInsights.findMany({
      where: and(
        eq(adDailyInsights.brandId, recommendation.brandId),
        gte(adDailyInsights.date, startOfMonth),
        lte(adDailyInsights.date, endOfMonth),
      ),
    });

    let totalSpend = 0;
    if (daily.length > 0) {
      totalSpend = daily.reduce((sum, row) => {
        const s = (row as unknown as { spend?: number }).spend ?? 0;
        return sum + s;
      }, 0);
    } else {
      const ads = await db.query.metaAds.findMany({ where: eq(metaAds.brandId, recommendation.brandId) });
      totalSpend = ads.reduce((sum, row) => sum + ((row as unknown as { spend?: number }).spend ?? 0), 0);
    }

    const limit = brandConfig.spendLimit.monthlyLimit;
    const pct = (totalSpend / limit) * 100;
    if (pct >= 100) {
      const result: ActionResult = {
        success: false,
        action: recommendation.action,
        error: `Spend limit reached (RM${totalSpend.toFixed(0)} / RM${limit}) — budget boost blocked`,
      };
      log("warn", "action_executor", `Spend limit reached for brand ${recommendation.brandId}`, {
        totalSpend,
        limit,
      });
      await logAudit("action_skipped_spend_limit", recommendation, result);
      return result;
    }
  }

  try {
    const accessToken = await getAccessTokenForBrand(recommendation.brandId);

    let result: ActionResult;
    switch (recommendation.action) {
      case "kill":
      case "pause":
        result = await executeKillOrPause(recommendation, accessToken);
        break;
      case "boost_budget":
        result = await executeBoostBudget(recommendation, accessToken, overrideBudget);
        break;
      case "duplicate":
        result = await executeDuplicate(recommendation, accessToken);
        break;
      default:
        result = {
          success: false,
          action: recommendation.action,
          error: `Unknown action: ${recommendation.action}`,
        };
    }

    await db
      .update(decisionJournal)
      .set({
        actionTaken: result.success,
        actionResult: JSON.stringify(result),
      })
      .where(eq(decisionJournal.id, journalId));

    log(
      result.success ? "info" : "error",
      "action_executor",
      `Result: ${result.success ? "SUCCESS" : "FAILED"} — ${recommendation.action} on "${recommendation.adName}"`,
      { result },
    );
    await logAudit(result.success ? "action_executed" : "action_failed", recommendation, result);
    return result;
  } catch (error) {
    const result: ActionResult = {
      success: false,
      action: recommendation.action,
      error: error instanceof Error ? error.message : "Unknown error",
    };
    await db
      .update(decisionJournal)
      .set({ actionTaken: false, actionResult: JSON.stringify(result) })
      .where(eq(decisionJournal.id, journalId));

    log("error", "action_executor", `Exception: ${recommendation.action} on "${recommendation.adName}"`, {
      error: result.error,
    });
    await logAudit("action_error", recommendation, result);
    return result;
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
