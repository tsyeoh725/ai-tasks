import { db } from "@/db";
import { brands, metaAds, metaAdSets, metaCampaigns, adDailyInsights } from "@/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";

// GET /api/meta-ads?brandId=&startDate=&endDate=&status=&healthScore=
// Returns aggregated KPIs per ad (joined with adDailyInsights + metaAdSets).
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const startDate = searchParams.get("startDate"); // yyyy-mm-dd
  const endDate = searchParams.get("endDate"); // yyyy-mm-dd
  const statusFilter = searchParams.get("status");
  const healthScoreFilter = searchParams.get("healthScore");

  // Load the brands accessible in the current workspace (for dropdown + scoping).
  const ws = await resolveWorkspaceForUser(user.id);
  const userBrands = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true, name: true, config: true, isActive: true },
  });
  const userBrandIds = userBrands.map((b) => b.id);

  // If a brandId is passed, enforce access.
  if (brandId && brandId !== "all" && !userBrandIds.includes(brandId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (userBrandIds.length === 0) {
    return NextResponse.json({ ads: [], brands: [] });
  }

  // Build the daily-insights query scoped to the user's brands.
  const dailyConditions = [
    brandId && brandId !== "all"
      ? eq(adDailyInsights.brandId, brandId)
      : inArray(adDailyInsights.brandId, userBrandIds),
  ];
  if (startDate) dailyConditions.push(gte(adDailyInsights.date, startDate));
  if (endDate) dailyConditions.push(lte(adDailyInsights.date, endDate));

  const dailyRows = await db.query.adDailyInsights.findMany({
    where: and(...dailyConditions),
    columns: {
      adId: true,
      spend: true,
      impressions: true,
      clicks: true,
      leads: true,
      ctr: true,
      frequency: true,
    },
  });

  // Aggregate per-ad.
  interface Agg {
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    ctrSum: number;
    freqSum: number;
    days: number;
  }
  const aggregated = new Map<string, Agg>();
  for (const row of dailyRows) {
    const existing = aggregated.get(row.adId) || {
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      ctrSum: 0,
      freqSum: 0,
      days: 0,
    };
    existing.spend += row.spend ?? 0;
    existing.impressions += row.impressions ?? 0;
    existing.clicks += row.clicks ?? 0;
    existing.leads += row.leads ?? 0;
    existing.ctrSum += row.ctr ?? 0;
    existing.freqSum += row.frequency ?? 0;
    existing.days += 1;
    aggregated.set(row.adId, existing);
  }

  // When a date filter is supplied, the result must come from daily insights —
  // never the lifetime totals stored on metaAds. Falling back to lifetime when
  // the picked range has no data (e.g. Meta hasn't aggregated today yet) made
  // a 2-day filter silently render a lifetime answer.
  const dateFilterActive = !!(startDate || endDate);
  const adIdsWithDaily = Array.from(aggregated.keys());
  let adRowConditions = [
    brandId && brandId !== "all"
      ? eq(metaAds.brandId, brandId)
      : inArray(metaAds.brandId, userBrandIds),
  ];
  if (statusFilter && statusFilter !== "all") {
    adRowConditions.push(eq(metaAds.status, statusFilter));
  }
  if (dateFilterActive) {
    if (adIdsWithDaily.length === 0) {
      return NextResponse.json({ ads: [], brands: userBrands, adSets: [], campaigns: [] });
    }
    adRowConditions = [inArray(metaAds.id, adIdsWithDaily), ...adRowConditions];
  } else if (adIdsWithDaily.length > 0) {
    // No date filter: still prefer rows that have any daily data when present.
    adRowConditions = [inArray(metaAds.id, adIdsWithDaily), ...adRowConditions];
  }

  const adRows = await db.query.metaAds.findMany({
    where: and(...adRowConditions),
    with: {
      adSet: {
        with: { campaign: { columns: { id: true, name: true } } },
        columns: { id: true, name: true, campaignId: true },
      },
      brand: { columns: { id: true, name: true, config: true } },
    },
  });

  // Parse each brand's config to get thresholds for an optional healthScore filter.
  const brandConfigById = new Map<string, Record<string, unknown>>();
  for (const b of userBrands) {
    try {
      brandConfigById.set(b.id, b.config ? JSON.parse(b.config) : {});
    } catch {
      brandConfigById.set(b.id, {});
    }
  }

  function computeHealth(cpl: number | null, ctr: number | null, frequency: number | null, bId: string): string {
    const cfg = brandConfigById.get(bId);
    const thresholds = cfg?.thresholds as
      | { cplMax: number | null; ctrMin: number | null; frequencyMax: number | null }
      | undefined;
    if (!thresholds) return "unknown";

    const cplBad =
      thresholds.cplMax !== null &&
      thresholds.cplMax !== undefined &&
      cpl !== null &&
      cpl > thresholds.cplMax;
    const ctrBad =
      thresholds.ctrMin !== null &&
      thresholds.ctrMin !== undefined &&
      ctr !== null &&
      ctr < thresholds.ctrMin;
    const freqBad =
      thresholds.frequencyMax !== null &&
      thresholds.frequencyMax !== undefined &&
      frequency !== null &&
      frequency > thresholds.frequencyMax;

    if (cplBad && ctrBad) return "critical";
    if (cplBad || ctrBad || freqBad) return "warning";
    return "healthy";
  }

  const enriched = adRows
    .map((ad) => {
      const agg = aggregated.get(ad.id);
      // When a date filter is active, ignore the lifetime totals on the ad row
      // and report only what came back from daily insights for that window.
      const spend = dateFilterActive ? agg?.spend ?? 0 : agg?.spend ?? ad.spend ?? 0;
      const impressions = dateFilterActive ? agg?.impressions ?? 0 : agg?.impressions ?? ad.impressions ?? 0;
      const clicks = dateFilterActive ? agg?.clicks ?? 0 : agg?.clicks ?? ad.clicks ?? 0;
      const leads = dateFilterActive ? agg?.leads ?? 0 : agg?.leads ?? ad.leads ?? 0;
      const days = agg?.days ?? 0;

      // CPL only makes sense when there is real spend AND at least one lead.
      // Showing "RM0.00 CPL" for ads where Meta retroactively attributed
      // leads but billed nothing in the period is misleading — surface "—"
      // instead so the contradiction (e.g. 8 leads / RM0 spend) is clear.
      const cpl =
        leads > 0 && spend > 0
          ? spend / leads
          : dateFilterActive
            ? null
            : ad.cpl ?? null;

      // CTR is unreliable below a minimum impression count: 1 impression / 1
      // click reads as 100% which is meaningless. Require at least
      // MIN_IMPRESSIONS_FOR_CTR before reporting a percentage; below that,
      // surface "—" so it is obvious there isn't enough data yet.
      const MIN_IMPRESSIONS_FOR_CTR = 100;
      const ctr =
        impressions >= MIN_IMPRESSIONS_FOR_CTR
          ? (clicks / impressions) * 100
          : dateFilterActive
            ? null
            : ad.ctr ?? null;

      const frequency = days > 0 ? (agg?.freqSum ?? 0) / days : dateFilterActive ? null : ad.frequency ?? null;

      const healthScore = computeHealth(cpl, ctr, frequency, ad.brandId);

      return {
        id: ad.id,
        metaAdId: ad.metaAdId,
        brandId: ad.brandId,
        brandName: ad.brand?.name ?? null,
        adSetId: ad.adSetId,
        adSetName: ad.adSet?.name ?? null,
        campaignId: ad.adSet?.campaignId ?? null,
        campaignName: ad.adSet?.campaign?.name ?? null,
        name: ad.name,
        status: ad.status,
        spend,
        impressions,
        clicks,
        leads,
        cpl,
        ctr,
        frequency,
        healthScore,
      };
    })
    .filter((a) => (healthScoreFilter && healthScoreFilter !== "all" ? a.healthScore === healthScoreFilter : true))
    .sort((a, b) => b.spend - a.spend);

  // Also surface the ad sets + campaigns (thin payloads) so the UI can render filters.
  const brandIdForFilter = brandId && brandId !== "all" ? brandId : null;
  const adSetCondition = brandIdForFilter
    ? eq(metaAdSets.brandId, brandIdForFilter)
    : inArray(metaAdSets.brandId, userBrandIds);
  const campaignCondition = brandIdForFilter
    ? eq(metaCampaigns.brandId, brandIdForFilter)
    : inArray(metaCampaigns.brandId, userBrandIds);

  const [adSets, campaigns] = await Promise.all([
    db.query.metaAdSets.findMany({
      where: adSetCondition,
      columns: { id: true, name: true, brandId: true, campaignId: true },
    }),
    db.query.metaCampaigns.findMany({
      where: campaignCondition,
      columns: { id: true, name: true, brandId: true },
    }),
  ]);

  return NextResponse.json({
    ads: enriched,
    brands: userBrands,
    adSets,
    campaigns,
  });
}
