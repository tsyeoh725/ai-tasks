import { db } from "@/db";
import { brands, marketingAuditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { syncCampaigns, syncAdSets, syncAdsWithInsights } from "@/lib/marketing/sync";
import { resolveMetaAccessToken } from "@/lib/marketing/meta-token";

// POST /api/meta/pull-all  { brandId, months?: number }
//
// Streams progress as newline-delimited JSON (`application/x-ndjson`):
//
//   {"type":"plan","chunks":12,"campaigns":4,"adSets":18,"costActionType":"lead"}
//   {"type":"chunk","index":0,"total":12,"since":"2023-05-02","until":"2023-07-30","phase":"start"}
//   {"type":"chunk","index":0,"total":12,"since":"2023-05-02","until":"2023-07-30","phase":"end","ok":true,"rows":423}
//   ...
//   {"type":"persist","ads":92,"dailyRows":2104}
//   {"type":"complete","synced":{...}}
//
// or terminates with one of:
//
//   {"type":"error","error":"..."}
//
// `months` is capped at 36 inside syncAdsWithInsights.
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
  const userId = user.id;
  const accountId = brand.metaAccountId;
  const internalBrandId = brand.id;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const campaignCount = await syncCampaigns(accountId, internalBrandId, userId, accessToken);
        const adSetCount = await syncAdSets(accountId, internalBrandId, userId, accessToken);

        const insights = await syncAdsWithInsights(
          accountId,
          internalBrandId,
          userId,
          accessToken,
          dateRangeDays,
          costActionType,
          {
            onPlan: (chunks) =>
              send({
                type: "plan",
                chunks: chunks.length,
                campaigns: campaignCount,
                adSets: adSetCount,
                costActionType,
              }),
            onChunkStart: (index, total, chunk) =>
              send({ type: "chunk", phase: "start", index, total, ...chunk }),
            onChunkEnd: (index, total, chunk, result) =>
              send({ type: "chunk", phase: "end", index, total, ...chunk, ...result }),
            onPersistStart: (ads, dailyRows) =>
              send({ type: "persist", ads, dailyRows }),
          },
        );

        await db.insert(marketingAuditLog).values({
          id: uuid(),
          userId,
          eventType: "pull_all_historical",
          entityType: "brand",
          entityId: internalBrandId,
          payload: JSON.stringify({
            months,
            campaignCount,
            adSetCount,
            insights,
            costActionType,
          }),
          level: insights.chunksFailed > 0 ? "warn" : "info",
          createdAt: new Date(),
        });

        send({
          type: "complete",
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
        controller.close();
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Pull failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering (nginx/cloudflared) so events ship as they're written.
      "X-Accel-Buffering": "no",
    },
  });
}
