import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { syncCampaigns, syncAdSets, syncAdsWithInsights } from "@/lib/marketing/sync";
import { resolveMetaAccessToken } from "@/lib/marketing/meta-token";
import { canAccessBrand } from "@/lib/brand-access";
import { flushLogs, log } from "@/lib/marketing/logger";

// POST /api/meta/sync  { brandId, startDate?, endDate? }
// Note: our sync implementation uses a trailing-window (dateRange in days) rather than
// start/end, so if startDate is provided we derive a day-count from it (ignoring endDate).
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

  const accessToken = await resolveMetaAccessToken(brand);
  if (!accessToken) {
    return NextResponse.json(
      {
        error: "No Meta access token configured",
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

  // Derive day-count from startDate if supplied, otherwise use brand default.
  let dateRange = insightsDateRange;
  if (startDate) {
    const start = new Date(startDate);
    const diff = Math.ceil((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (!Number.isNaN(diff) && diff > 0) dateRange = diff;
  }

  const sessionLabel = `sync-${brand.name}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  log("info", "sync", `Manual sync started for ${brand.name}`, {
    brandId: brand.id,
    dateRange,
    costActionType,
  });

  try {
    const campaignCount = await syncCampaigns(brand.metaAccountId, brand.id, user.id, accessToken);
    const adSetCount = await syncAdSets(brand.metaAccountId, brand.id, user.id, accessToken);
    const insights = await syncAdsWithInsights(
      brand.metaAccountId,
      brand.id,
      user.id,
      accessToken,
      dateRange,
      costActionType,
    );

    log(
      insights.chunksFailed > 0 ? "warn" : "info",
      "sync",
      `Sync complete for ${brand.name}`,
      { campaignCount, adSetCount, insights },
    );

    await flushLogs(sessionLabel, user.id);

    return NextResponse.json({
      success: true,
      synced: {
        campaigns: campaignCount,
        adSets: adSetCount,
        ads: insights.ads,
        chunksTotal: insights.chunksTotal,
        chunksSucceeded: insights.chunksSucceeded,
        chunksFailed: insights.chunksFailed,
        failedChunks: insights.failedChunks,
      },
    });
  } catch (err) {
    log("error", "sync", `Sync failed for ${brand.name}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    await flushLogs(sessionLabel, user.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
