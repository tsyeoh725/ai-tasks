import { db } from "@/db";
import { brands, metaAds, marketingAuditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import * as metaApi from "@/lib/marketing/meta-api";

// POST /api/meta-ads/action  { adId, action: "pause" | "activate" }
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { adId?: string; action?: string };
  const { adId, action } = body;

  if (!adId || (action !== "pause" && action !== "activate")) {
    return NextResponse.json(
      { error: "adId and valid action (pause|activate) are required" },
      { status: 400 },
    );
  }

  const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, adId) });
  if (!ad) {
    return NextResponse.json({ error: "Ad not found" }, { status: 404 });
  }

  // Ownership check — the ad's brand must belong to the current user.
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, ad.brandId) });
  if (!brand || brand.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accessToken =
    (brand as unknown as { metaAccessToken?: string | null }).metaAccessToken ||
    process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "No Meta access token configured for this brand" },
      { status: 400 },
    );
  }

  const newStatus: "PAUSED" | "ACTIVE" = action === "pause" ? "PAUSED" : "ACTIVE";

  try {
    if (action === "pause") {
      await metaApi.pauseAd(ad.metaAdId, accessToken);
    } else {
      await metaApi.activateAd(ad.metaAdId, accessToken);
    }

    await db.update(metaAds).set({ status: newStatus }).where(eq(metaAds.id, adId));

    await db.insert(marketingAuditLog).values({
      id: uuid(),
      userId: user.id,
      eventType: `manual_${action}`,
      entityType: "ad",
      entityId: adId,
      payload: JSON.stringify({
        adName: ad.name,
        brandId: ad.brandId,
        previousStatus: ad.status,
        newStatus,
      }),
      level: "info",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, newStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update ad";

    let userMsg = msg;
    if (msg.includes("WhatsApp Business required")) {
      userMsg = "Can't change this ad — Meta requires a WhatsApp Business account for WhatsApp ads.";
    } else if (msg.includes("OAuthException")) {
      const match = msg.match(/"error_user_msg":"([^"]+)"/);
      userMsg = match ? match[1] : "Meta rejected the request. Check your account permissions.";
    }

    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
