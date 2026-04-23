// Core Monitor — ported from jarvis/src/lib/agents/core-monitor.ts
// Runs an analysis cycle for a brand: fetches active ads + KPIs, compares to
// thresholds, generates Recommendations, passes each through AI Guard, and
// records verdicts in the decisionJournal.
import { db } from "@/db";
import { and, eq, gt } from "drizzle-orm";
// NOTE: `brands`, `metaAds`, `agentMemory`, and `decisionJournal` are expected
// to be added to the Drizzle schema by the parallel schema task with
// Jarvis-standard camelCase names.
import { brands, metaAds, agentMemory, decisionJournal } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/marketing/logger";
import {
  evaluateRecommendation,
  type BrandConfig,
  type BrandThresholds,
  type Recommendation,
  type GuardVerdict,
} from "@/lib/marketing/claude-guard";

export interface MonitorCycleResult {
  brandId: string;
  brandName: string;
  recommendationsCount: number;
  approved: number;
  rejected: number;
  pending: number;
  actionsTaken: number;
  errors: string[];
  verdicts: Array<{
    journalId: string;
    recommendation: Recommendation;
    verdict: GuardVerdict;
  }>;
}

// --- Local helpers: threshold analysis ---

interface AdWithContext {
  id: string; // internal metaAds row id
  brandId: string;
  metaAdId: string;
  adSetId: string;
  campaignId: string | null; // pulled from adSet relation below
  name: string;
  status: string;
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  syncedAt: Date | null;
}

function evaluateAd(
  ad: AdWithContext,
  brandId: string,
  brandName: string,
  thresholds: BrandThresholds,
  activeAdsInCampaign: number,
): Recommendation | null {
  const kpiValues = {
    cpl: ad.cpl,
    ctr: ad.ctr,
    frequency: ad.frequency,
    spend: ad.spend,
  };

  // Winner: CPL < 50% of max AND CTR > 2x min
  if (thresholds.cplMax !== null && thresholds.ctrMin !== null) {
    if (
      ad.cpl !== null &&
      ad.ctr !== null &&
      ad.cpl < thresholds.cplMax * 0.5 &&
      ad.ctr > thresholds.ctrMin * 2
    ) {
      return {
        brandId,
        brandName,
        adId: ad.id,
        adSetId: ad.adSetId,
        adName: ad.name,
        action: "boost_budget",
        reason: `Winner detected — CPL (RM ${ad.cpl.toFixed(2)}) is less than 50% of threshold (RM ${thresholds.cplMax}) and CTR (${ad.ctr.toFixed(2)}%) is more than 2x threshold (${thresholds.ctrMin}%). Boosting budget instead of duplicating (Meta app in dev mode).`,
        kpiValues,
        thresholds,
      };
    }
  }

  // Kill: CPL exceeds max AND CTR below min
  if (thresholds.cplMax !== null && thresholds.ctrMin !== null) {
    if (ad.cpl !== null && ad.ctr !== null && ad.cpl > thresholds.cplMax && ad.ctr < thresholds.ctrMin) {
      const action: Recommendation["action"] = activeAdsInCampaign <= 1 ? "pause" : "kill";
      const suffix =
        activeAdsInCampaign <= 1 ? " (downgraded from kill — last active ad in campaign)" : "";
      return {
        brandId,
        brandName,
        adId: ad.id,
        adSetId: ad.adSetId,
        adName: ad.name,
        action,
        reason: `CPL (RM ${ad.cpl.toFixed(2)}) exceeds threshold (RM ${thresholds.cplMax}) AND CTR (${ad.ctr.toFixed(2)}%) below threshold (${thresholds.ctrMin}%)${suffix}`,
        kpiValues,
        thresholds,
      };
    }
  }

  // Pause: CPL exceeds max (targeting issue — CTR is fine)
  if (thresholds.cplMax !== null) {
    if (ad.cpl !== null && ad.cpl > thresholds.cplMax) {
      return {
        brandId,
        brandName,
        adId: ad.id,
        adSetId: ad.adSetId,
        adName: ad.name,
        action: "pause",
        reason: `CPL (RM ${ad.cpl.toFixed(2)}) exceeds threshold (RM ${thresholds.cplMax}) — possible targeting issue (CTR is acceptable)`,
        kpiValues,
        thresholds,
      };
    }
  }

  // Pause: Frequency too high (audience fatigue)
  if (thresholds.frequencyMax !== null) {
    if (ad.frequency !== null && ad.frequency > thresholds.frequencyMax) {
      return {
        brandId,
        brandName,
        adId: ad.id,
        adSetId: ad.adSetId,
        adName: ad.name,
        action: "pause",
        reason: `Frequency (${ad.frequency.toFixed(2)}) exceeds threshold (${thresholds.frequencyMax}) — audience fatigue detected`,
        kpiValues,
        thresholds,
      };
    }
  }

  return null;
}

// --- Public API ---

/**
 * Generate recommendations for a brand without calling the AI Guard.
 * Useful for dry-runs / tests.
 */
export async function analyzeBrand(brandId: string): Promise<Recommendation[]> {
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) throw new Error(`Brand not found: ${brandId}`);

  const config = (brand.config ? JSON.parse(brand.config as unknown as string) : null) as BrandConfig | null;
  if (!config) return [];

  const thresholds = config.thresholds;
  if (thresholds.cplMax === null && thresholds.ctrMin === null && thresholds.frequencyMax === null) {
    return [];
  }

  const eightHoursAgo = new Date();
  eightHoursAgo.setHours(eightHoursAgo.getHours() - 8);

  const adsRaw = await db.query.metaAds.findMany({
    where: and(eq(metaAds.brandId, brandId), eq(metaAds.status, "ACTIVE"), gt(metaAds.syncedAt, eightHoursAgo)),
    with: { adSet: { columns: { campaignId: true } } },
  });

  if (adsRaw.length === 0) return [];

  const ads: AdWithContext[] = adsRaw.map((a) => {
    const row = a as unknown as AdWithContext & { adSet?: { campaignId: string | null } };
    return { ...row, campaignId: row.adSet?.campaignId ?? null };
  });

  // Last-ad protection — count active ads per campaign
  const adsPerCampaign = new Map<string, number>();
  for (const ad of ads) {
    const key = ad.campaignId || "";
    adsPerCampaign.set(key, (adsPerCampaign.get(key) || 0) + 1);
  }

  const recommendations: Recommendation[] = [];
  for (const ad of ads) {
    const rec = evaluateAd(ad, brandId, brand.name, thresholds, adsPerCampaign.get(ad.campaignId || "") || 1);
    if (rec) recommendations.push(rec);
  }

  return recommendations;
}

/**
 * Full cycle: generate recommendations, pass each through AI Guard, and persist
 * verdicts into the decisionJournal. Returns a per-brand summary that also
 * includes the journal IDs for downstream execution.
 */
export async function runMonitorCycleForBrand(brandId: string): Promise<MonitorCycleResult> {
  log("info", "monitor", `Starting monitor cycle for brand ${brandId}`);

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) {
    return {
      brandId,
      brandName: "(unknown)",
      recommendationsCount: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      actionsTaken: 0,
      errors: [`Brand not found: ${brandId}`],
      verdicts: [],
    };
  }

  const result: MonitorCycleResult = {
    brandId,
    brandName: brand.name,
    recommendationsCount: 0,
    approved: 0,
    rejected: 0,
    pending: 0,
    actionsTaken: 0,
    errors: [],
    verdicts: [],
  };

  const config = (brand.config ? JSON.parse(brand.config as unknown as string) : null) as BrandConfig | null;
  if (!config) {
    result.errors.push("Brand config missing");
    return result;
  }

  let recommendations: Recommendation[];
  try {
    recommendations = await analyzeBrand(brandId);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "analyzeBrand failed");
    return result;
  }

  result.recommendationsCount = recommendations.length;
  if (recommendations.length === 0) {
    log("info", "monitor", `No recommendations for ${brand.name}`);
    return result;
  }

  // Pull recent memory for the brand to pass to the guard (preferences + summaries)
  const memory = await db.query.agentMemory.findMany({
    where: eq(agentMemory.brandId, brandId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit: 10,
  });
  const memoryEntries = memory.map((m) => ({
    memoryType: m.memoryType as string,
    content: m.content as string,
    createdAt: m.createdAt as Date,
  }));

  // Evaluate each recommendation and persist to decisionJournal
  for (const rec of recommendations) {
    try {
      const verdict = await evaluateRecommendation(rec, config, memoryEntries);

      if (verdict.verdict === "approved") result.approved++;
      else if (verdict.verdict === "rejected") result.rejected++;
      else result.pending++;

      const journalId = uuid();
      await db.insert(decisionJournal).values({
        id: journalId,
        userId: brand.userId,
        brandId,
        adId: rec.adId,
        adSetId: rec.adSetId,
        recommendation: rec.action,
        reason: rec.reason,
        kpiValues: JSON.stringify(rec.kpiValues),
        guardVerdict: verdict.verdict,
        guardReasoning: verdict.reasoning,
        confidence: verdict.confidence,
        riskLevel: verdict.riskLevel,
        actionTaken: false,
        actionResult: null,
        createdAt: new Date(),
      });

      result.verdicts.push({ journalId, recommendation: rec, verdict });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Failed to evaluate "${rec.adName}": ${msg}`);
      log("error", "monitor", `Guard evaluation failed for ${rec.adName}`, { error: msg });
    }
  }

  log("info", "monitor", `Cycle complete for ${brand.name}`, {
    recommendations: result.recommendationsCount,
    approved: result.approved,
    rejected: result.rejected,
    pending: result.pending,
  });

  return result;
}

/**
 * Run a monitor cycle for all active brands. If `userId` is provided, only
 * brands owned by that user are included.
 */
export async function runMonitorCycleForAllBrands(userId?: string): Promise<MonitorCycleResult[]> {
  const activeBrands = await db.query.brands.findMany({
    where: userId
      ? and(eq(brands.isActive, true), eq(brands.userId, userId))
      : eq(brands.isActive, true),
  });
  const results: MonitorCycleResult[] = [];
  for (const b of activeBrands) {
    try {
      results.push(await runMonitorCycleForBrand(b.id));
    } catch (err) {
      results.push({
        brandId: b.id,
        brandName: b.name,
        recommendationsCount: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        actionsTaken: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
        verdicts: [],
      });
    }
  }
  return results;
}
