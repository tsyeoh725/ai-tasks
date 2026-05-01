import { db } from "@/db";
import { brands, metaAds, metaAdSets, metaCampaigns, adDailyInsights } from "@/db/schema";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

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

  // Load the user's brands (for dropdown + scoping).
  const userBrands = await db.query.brands.findMany({
    where: eq(brands.userId, user.id),
    columns: { id: true, name: true, config: true, isActive: true },
  });
  const userBrandIds = userBrands.map((b) => b.id);

  // If a brandId is passed, enforce ownership.
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

  // If no daily data, fall back to the aggregated totals already on metaAds.
  const adIdsWithDaily = Array.from(aggregated.keys());
  let adRowConditions = [
    brandId && brandId !== "all"
      ? eq(metaAds.brandId, brandId)
      : inArray(metaAds.brandId, userBrandIds),
  ];
  if (statusFilter && statusFilter !== "all") {
    adRowConditions.push(eq(metaAds.status, statusFilter));
  }
  // If we have daily data, narrow to those ad IDs; otherwise show all ads for the brand.
  if (adIdsWithDaily.length > 0) {
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
      const spend = agg?.spend ?? ad.spend ?? 0;
      const impressions = agg?.impressions ?? ad.impressions ?? 0;
      const clicks = agg?.clicks ?? ad.clicks ?? 0;
      const leads = agg?.leads ?? ad.leads ?? 0;
      const days = agg?.days ?? 0;

      const cpl = leads > 0 ? spend / leads : ad.cpl ?? null;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : ad.ctr ?? null;
      const frequency = days > 0 ? (agg?.freqSum ?? 0) / days : ad.frequency ?? null;

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
