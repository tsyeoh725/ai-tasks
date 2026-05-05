import { db } from "@/db";
import { automationSettings, brands, cycleRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { resolveMetaAccessToken } from "@/lib/marketing/meta-token";
import { syncCampaigns, syncAdSets, syncAdsWithInsights } from "@/lib/marketing/sync";
import { runMonitorCycleForBrand } from "@/lib/marketing/core-monitor";
import { flushLogs, log } from "@/lib/marketing/logger";

// Single chained "automation cycle" for one brand: sync → audit. Each step
// writes a `cycle_runs` row tagged with the same `cycleId` so the UI can
// render a clean per-brand timeline. Failures in sync still let audit run
// (audit will operate on whatever data was last synced — better than no
// audit at all when Meta is intermittently flaky).

export type CycleTrigger = "scheduled" | "manual";

async function recordStep(
  cycleId: string,
  brandId: string,
  step: "sync" | "audit",
  trigger: CycleTrigger,
  status: "succeeded" | "failed" | "skipped",
  startedAt: Date,
  result: unknown | null,
  error: string | null,
) {
  await db.insert(cycleRuns).values({
    id: uuid(),
    cycleId,
    brandId,
    step,
    status,
    trigger,
    result: result === null ? null : JSON.stringify(result),
    error,
    startedAt,
    finishedAt: new Date(),
    createdAt: new Date(),
  });
}

export async function runAutomationCycleForBrand(
  brandId: string,
  trigger: CycleTrigger,
): Promise<{ cycleId: string; sync: "succeeded" | "failed"; audit: "succeeded" | "failed" | "skipped" }> {
  const cycleId = uuid();

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  // Step 1: sync. If Meta token is missing, mark the sync step skipped and
  // still try the audit (it will run on stale data and at minimum produce
  // a consistent failure path for the operator).
  const syncStartedAt = new Date();
  let syncStatus: "succeeded" | "failed" | "skipped" = "succeeded";
  let syncResult: unknown = null;
  let syncError: string | null = null;
  try {
    const token = await resolveMetaAccessToken(brand);
    if (!token) {
      syncStatus = "skipped";
      syncError = "No Meta access token configured for this brand";
    } else {
      const parsed = (() => {
        try {
          return brand.config ? (JSON.parse(brand.config) as Record<string, unknown>) : {};
        } catch {
          return {} as Record<string, unknown>;
        }
      })();
      const costMetric = parsed.costMetric as { actionType?: string } | undefined;
      const costActionType = costMetric?.actionType || "lead";
      const dateRange = (parsed.insightsDateRange as number | undefined) ?? 7;

      const campaignCount = await syncCampaigns(brand.metaAccountId, brand.id, brand.userId, token);
      const adSetCount = await syncAdSets(brand.metaAccountId, brand.id, brand.userId, token);
      const insights = await syncAdsWithInsights(
        brand.metaAccountId,
        brand.id,
        brand.userId,
        token,
        dateRange,
        costActionType,
      );
      const summary = {
        campaigns: campaignCount,
        adSets: adSetCount,
        ads: insights.ads,
        chunksFailed: insights.chunksFailed,
      };
      syncResult = summary;
      log("info", "monitor", `Cycle sync complete for ${brand.name}`, summary);
    }
  } catch (err) {
    syncStatus = "failed";
    syncError = err instanceof Error ? err.message : String(err);
    log("error", "monitor", `Cycle sync failed for ${brand.name}`, { error: syncError });
  }
  await recordStep(cycleId, brandId, "sync", trigger, syncStatus, syncStartedAt, syncResult, syncError);

  // Step 2: audit. Always runs even when sync failed — operator may have
  // turned off Meta integration and just want the AI Guard to flag old
  // data; better to surface that than silently halt the cycle.
  const auditStartedAt = new Date();
  let auditStatus: "succeeded" | "failed" | "skipped" = "succeeded";
  let auditResult: unknown = null;
  let auditError: string | null = null;
  try {
    const cycle = await runMonitorCycleForBrand(brandId);
    const summary = {
      recommendations: cycle.recommendationsCount,
      approved: cycle.approved,
      rejected: cycle.rejected,
      pending: cycle.pending,
      actionsTaken: cycle.actionsTaken,
      errors: cycle.errors,
    };
    auditResult = summary;
    log("info", "monitor", `Cycle audit complete for ${brand.name}`, summary);
  } catch (err) {
    auditStatus = "failed";
    auditError = err instanceof Error ? err.message : String(err);
    log("error", "monitor", `Cycle audit failed for ${brand.name}`, { error: auditError });
  }
  await recordStep(cycleId, brandId, "audit", trigger, auditStatus, auditStartedAt, auditResult, auditError);

  // Persist cycle timestamp so the scheduler's "is this brand due?" check
  // works without scanning cycle_runs every tick.
  await db
    .insert(automationSettings)
    .values({
      id: uuid(),
      brandId,
      enabled: false,
      cadenceHours: 6,
      autoApproveMinConfidence: 0.85,
      autoApproveActions: "[\"pause\",\"kill\"]",
      lastCycleAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: automationSettings.brandId,
      set: { lastCycleAt: new Date(), updatedAt: new Date() },
    });

  await flushLogs(`automation-${cycleId}`, brand.userId);

  return {
    cycleId,
    sync: syncStatus === "skipped" ? "failed" : syncStatus,
    audit: auditStatus,
  };
}
