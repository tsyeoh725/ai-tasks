import { db } from "@/db";
import { brands, marketingAuditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { syncCampaigns, syncAdSets, syncAdsWithInsights } from "@/lib/marketing/sync";
import { resolveMetaAccessToken } from "@/lib/marketing/meta-token";

// POST /api/meta/pull-all  { brandId, months?: number }
// Historical backfill. `months` is capped at 36 inside syncAdsWithInsights.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { brandId?: string; months?: number };
  const { brandId } = body;
  const months = typeof body.months === "number" && body.months > 0 ? body.months : 36;

  if (!brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (brand.userId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const dateRangeDays = Math.min(months, 36) * 30;

  try {
    const campaignCount = await syncCampaigns(brand.metaAccountId, brand.id, user.id, accessToken);
    const adSetCount = await syncAdSets(brand.metaAccountId, brand.id, user.id, accessToken);
    const adCount = await syncAdsWithInsights(
      brand.metaAccountId,
      brand.id,
      user.id,
      accessToken,
      dateRangeDays,
      costActionType,
    );

    await db.insert(marketingAuditLog).values({
      id: uuid(),
      userId: user.id,
      eventType: "pull_all_historical",
      entityType: "brand",
      entityId: brand.id,
      payload: JSON.stringify({ months, campaignCount, adSetCount, adCount, costActionType }),
      level: "info",
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      synced: { campaigns: campaignCount, adSets: adSetCount, ads: adCount },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pull failed" },
      { status: 500 },
    );
  }
}
