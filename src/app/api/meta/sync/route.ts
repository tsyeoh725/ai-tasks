import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import {
  buildPlatformContext,
  getAdPlatform,
} from "@/lib/ad-platforms/registry";
import { canAccessBrand } from "@/lib/brand-access";
import { flushLogs, log } from "@/lib/marketing/logger";
import { startJob } from "@/lib/jobs";

// POST /api/meta/sync  { brandId, startDate?, endDate? }
// Returns 202 with { jobId } — the actual sync runs detached so the client
// can navigate away. Poll /api/jobs/active for status.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as {
    brandId?: string;
    startDate?: string;
    endDate?: string;
  };
  const { brandId, startDate } = body;

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!(await canAccessBrand(brand, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let ctx;
  try {
    ctx = await buildPlatformContext("meta", brandId);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "No Meta access token configured",
        hint: "Add your Meta Graph API access token under Settings → Meta Ads.",
      },
      { status: 412 },
    );
  }

  const parsedConfig = (() => {
    try {
      return brand.config ? (JSON.parse(brand.config) as Record<string, unknown>) : {};
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const costMetric = parsedConfig.costMetric as { actionType?: string } | undefined;
  const costActionType = costMetric?.actionType || "lead";
  const insightsDateRange = (parsedConfig.insightsDateRange as number | undefined) ?? 7;

  let dateRange = insightsDateRange;
  if (startDate) {
    const start = new Date(startDate);
    const diff = Math.ceil((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (!Number.isNaN(diff) && diff > 0) dateRange = diff;
  }

  const handle = await startJob({
    userId: user.id,
    type: "meta_sync",
    label: `Meta sync — ${brand.name}`,
    payload: { brandId, dateRange, costActionType },
    work: async () => {
      const sessionLabel = `sync-${brand.name}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      log("info", "sync", `Background sync started for ${brand.name}`, {
        brandId: brand.id,
        dateRange,
        costActionType,
      });
      try {
        const adapter = getAdPlatform("meta");
        const campaignCount = await adapter.syncCampaigns(ctx);
        const adSetCount = await adapter.syncAdSets(ctx);
        const insights = await adapter.syncAdsWithInsights(ctx, {
          dateRangeDays: dateRange,
          costActionType,
        });
        log(
          insights.chunksFailed > 0 ? "warn" : "info",
          "sync",
          `Sync complete for ${brand.name}`,
          { campaignCount, adSetCount, insights },
        );
        await flushLogs(sessionLabel, user.id);
        return {
          campaigns: campaignCount,
          adSets: adSetCount,
          ads: insights.ads,
          chunksTotal: insights.chunksTotal,
          chunksSucceeded: insights.chunksSucceeded,
          chunksFailed: insights.chunksFailed,
          failedChunks: insights.failedChunks,
        };
      } catch (err) {
        log("error", "sync", `Sync failed for ${brand.name}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        await flushLogs(sessionLabel, user.id);
        throw err;
      }
    },
  });

  return NextResponse.json(
    { success: true, queued: true, jobId: handle.jobId },
    { status: 202 },
  );
}
