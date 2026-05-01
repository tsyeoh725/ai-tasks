// Sync helpers — pull Meta data and persist into our Drizzle tables.
// Implements the manual check-then-update upsert pattern since our schema
// doesn't declare explicit unique constraints on the Meta IDs.
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import {
  adDailyInsights,
  metaAdSets,
  metaAds,
  metaCampaigns,
} from "@/db/schema";
import { log } from "@/lib/marketing/logger";

const META_API_BASE = "https://graph.facebook.com/v21.0";

export interface MetaInsight {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  campaign_id: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  frequency?: string;
  actions?: Array<{ action_type: string; value: string }>;
  date_start?: string;
  date_stop?: string;
}

// Meta error codes that are retryable (rate limit / transient throttling).
// Docs: https://developers.facebook.com/docs/graph-api/guides/error-handling
const RETRYABLE_META_CODES = new Set([1, 2, 4, 17, 32, 80004, 613]);

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url);
  if (res.ok) return res;

  // Decide if this status / Meta error code is worth retrying.
  let retryable = res.status >= 500 || res.status === 429;
  let metaCode: number | undefined;
  let metaMessage: string | undefined;
  try {
    const body = (await res.clone().json()) as {
      error?: { code?: number; message?: string; error_subcode?: number };
    };
    metaCode = body?.error?.code;
    metaMessage = body?.error?.message;
    if (metaCode !== undefined && RETRYABLE_META_CODES.has(metaCode)) retryable = true;
  } catch {
    /* body wasn't JSON */
  }

  if (retryable && attempt < 5) {
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s. Rate-limit (429 / code 17 / 80004)
    // gets a longer pause to let Meta's window roll over.
    const longBackoff = res.status === 429 || metaCode === 17 || metaCode === 80004;
    const delay = (longBackoff ? 5000 : 2000) * Math.pow(2, attempt);
    log("warn", "meta_api", `retry ${attempt + 1}/5 in ${delay}ms`, {
      status: res.status,
      metaCode,
      metaMessage,
    });
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(url, attempt + 1);
  }
  return res;
}

async function fetchAllPages(
  endpoint: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<unknown[]> {
  const qs = new URLSearchParams({ access_token: accessToken, limit: "500", ...params });
  const firstUrl = `${META_API_BASE}/${endpoint}?${qs.toString()}`;
  const results: unknown[] = [];
  let res = await fetchWithRetry(firstUrl);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Meta API error: ${res.status} - ${JSON.stringify(err)}`);
  }
  let page = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
  results.push(...(page.data || []));
  while (page.paging?.next) {
    res = await fetchWithRetry(page.paging.next);
    if (!res.ok) break;
    page = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
    results.push(...(page.data || []));
  }
  return results;
}

function matchesActionType(metaActionType: string, configuredType: string): boolean {
  if (metaActionType === configuredType) return true;
  const core = configuredType.replace(/^(onsite_conversion\.|offsite_conversion\.)/, "");
  if (metaActionType.includes(core)) return true;
  if (metaActionType === `${configuredType}_grouped`) return true;
  return false;
}

// --- Upserts ---

async function upsertCampaign(
  userId: string,
  brandId: string,
  row: {
    metaCampaignId: string;
    name: string;
    status: string;
    objective: string | null;
    dailyBudget: number | null;
    lifetimeBudget: number | null;
  },
): Promise<string> {
  const existing = await db.query.metaCampaigns.findFirst({
    where: and(
      eq(metaCampaigns.brandId, brandId),
      eq(metaCampaigns.metaCampaignId, row.metaCampaignId),
    ),
  });
  if (existing) {
    await db
      .update(metaCampaigns)
      .set({
        name: row.name,
        status: row.status,
        objective: row.objective,
        dailyBudget: row.dailyBudget,
        lifetimeBudget: row.lifetimeBudget,
        syncedAt: new Date(),
      })
      .where(eq(metaCampaigns.id, existing.id));
    return existing.id;
  }
  const id = uuid();
  await db.insert(metaCampaigns).values({
    id,
    userId,
    brandId,
    metaCampaignId: row.metaCampaignId,
    name: row.name,
    status: row.status,
    objective: row.objective,
    dailyBudget: row.dailyBudget,
    lifetimeBudget: row.lifetimeBudget,
    syncedAt: new Date(),
    createdAt: new Date(),
  });
  return id;
}

async function upsertAdSet(
  userId: string,
  brandId: string,
  campaignId: string,
  row: {
    metaAdsetId: string;
    name: string;
    status: string;
    dailyBudget: number | null;
  },
): Promise<string> {
  const existing = await db.query.metaAdSets.findFirst({
    where: and(eq(metaAdSets.brandId, brandId), eq(metaAdSets.metaAdsetId, row.metaAdsetId)),
  });
  if (existing) {
    await db
      .update(metaAdSets)
      .set({
        name: row.name,
        status: row.status,
        dailyBudget: row.dailyBudget,
        campaignId,
        syncedAt: new Date(),
      })
      .where(eq(metaAdSets.id, existing.id));
    return existing.id;
  }
  const id = uuid();
  await db.insert(metaAdSets).values({
    id,
    userId,
    brandId,
    campaignId,
    metaAdsetId: row.metaAdsetId,
    name: row.name,
    status: row.status,
    dailyBudget: row.dailyBudget,
    syncedAt: new Date(),
    createdAt: new Date(),
  });
  return id;
}

async function upsertAd(
  userId: string,
  brandId: string,
  adSetId: string,
  row: {
    metaAdId: string;
    name: string;
    status: string;
    cpl: number | null;
    ctr: number | null;
    frequency: number | null;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
  },
): Promise<string> {
  const existing = await db.query.metaAds.findFirst({
    where: and(eq(metaAds.brandId, brandId), eq(metaAds.metaAdId, row.metaAdId)),
  });
  if (existing) {
    await db
      .update(metaAds)
      .set({
        name: row.name,
        status: row.status,
        cpl: row.cpl,
        ctr: row.ctr,
        frequency: row.frequency,
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        leads: row.leads,
        adSetId,
        syncedAt: new Date(),
      })
      .where(eq(metaAds.id, existing.id));
    return existing.id;
  }
  const id = uuid();
  await db.insert(metaAds).values({
    id,
    userId,
    brandId,
    adSetId,
    metaAdId: row.metaAdId,
    name: row.name,
    status: row.status,
    cpl: row.cpl,
    ctr: row.ctr,
    frequency: row.frequency,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    leads: row.leads,
    syncedAt: new Date(),
    createdAt: new Date(),
  });
  return id;
}

async function upsertDailyInsight(
  userId: string,
  brandId: string,
  adId: string,
  row: {
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    cpl: number | null;
    ctr: number | null;
    frequency: number | null;
  },
): Promise<void> {
  const existing = await db.query.adDailyInsights.findFirst({
    where: and(eq(adDailyInsights.adId, adId), eq(adDailyInsights.date, row.date)),
  });
  if (existing) {
    await db
      .update(adDailyInsights)
      .set({
        spend: row.spend,
        impressions: row.impressions,
        clicks: row.clicks,
        leads: row.leads,
        cpl: row.cpl,
        ctr: row.ctr,
        frequency: row.frequency,
      })
      .where(eq(adDailyInsights.id, existing.id));
    return;
  }
  await db.insert(adDailyInsights).values({
    id: uuid(),
    userId,
    adId,
    brandId,
    date: row.date,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    leads: row.leads,
    cpl: row.cpl,
    ctr: row.ctr,
    frequency: row.frequency,
    createdAt: new Date(),
  });
}

// --- Public sync entry points ---

export async function syncCampaigns(
  metaAccountId: string,
  brandId: string,
  userId: string,
  accessToken: string,
): Promise<number> {
  const campaigns = await fetchAllPages(`act_${metaAccountId}/campaigns`, accessToken, {
    fields: "id,name,status,objective,daily_budget,lifetime_budget",
  });
  for (const raw of campaigns as Array<Record<string, string>>) {
    await upsertCampaign(userId, brandId, {
      metaCampaignId: raw.id,
      name: raw.name,
      status: raw.status,
      objective: raw.objective || null,
      dailyBudget: raw.daily_budget ? parseFloat(raw.daily_budget) / 100 : null,
      lifetimeBudget: raw.lifetime_budget ? parseFloat(raw.lifetime_budget) / 100 : null,
    });
  }
  return campaigns.length;
}

export async function syncAdSets(
  metaAccountId: string,
  brandId: string,
  userId: string,
  accessToken: string,
): Promise<number> {
  const adsets = await fetchAllPages(`act_${metaAccountId}/adsets`, accessToken, {
    fields: "id,name,status,daily_budget,campaign_id",
  });
  let count = 0;
  for (const raw of adsets as Array<Record<string, string>>) {
    const campaign = await db.query.metaCampaigns.findFirst({
      where: and(eq(metaCampaigns.brandId, brandId), eq(metaCampaigns.metaCampaignId, raw.campaign_id)),
    });
    if (!campaign) {
      log("warn", "sync", `Skipping ad set ${raw.id} — campaign not found`, { metaCampaignId: raw.campaign_id });
      continue;
    }
    await upsertAdSet(userId, brandId, campaign.id, {
      metaAdsetId: raw.id,
      name: raw.name,
      status: raw.status,
      dailyBudget: raw.daily_budget ? parseFloat(raw.daily_budget) / 100 : null,
    });
    count++;
  }
  return count;
}

export type InsightsSyncResult = {
  ads: number;
  chunksTotal: number;
  chunksSucceeded: number;
  chunksFailed: number;
  failedChunks: Array<{ since: string; until: string; error: string }>;
};

export type InsightsProgress = {
  /** Called once with the chunk plan before the first fetch. */
  onPlan?: (chunks: Array<{ since: string; until: string }>) => void;
  /** Called immediately before each chunk fetch. */
  onChunkStart?: (index: number, total: number, chunk: { since: string; until: string }) => void;
  /** Called after each chunk completes, succeeded or failed. */
  onChunkEnd?: (
    index: number,
    total: number,
    chunk: { since: string; until: string },
    result: { ok: true; rows: number } | { ok: false; error: string },
  ) => void;
  /** Called after the per-chunk loop finishes, before the upserts run. */
  onPersistStart?: (totalAds: number, totalDailyRows: number) => void;
};

export async function syncAdsWithInsights(
  metaAccountId: string,
  brandId: string,
  userId: string,
  accessToken: string,
  dateRange: number = 7,
  costActionType: string = "lead",
  progress: InsightsProgress = {},
): Promise<InsightsSyncResult> {
  // 90-day chunks: Meta's daily-breakdown (`time_increment=1`) limit is 90
  // days per request for many ad accounts. 180 was too aggressive and would
  // bail with code 100 / 'reduce the time range' for high-volume accounts.
  const MAX_CHUNK_DAYS = 90;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - Math.min(dateRange, 1100));
  // Meta's hard lookback for ad-level insights is 37 months. Use 36 to be safe.
  const maxStart = new Date(today);
  maxStart.setMonth(maxStart.getMonth() - 36);
  if (startDate < maxStart) startDate.setTime(maxStart.getTime());

  const chunks: Array<{ since: string; until: string }> = [];
  if (dateRange <= MAX_CHUNK_DAYS) {
    const since = new Date(today);
    since.setDate(since.getDate() - dateRange);
    chunks.push({
      since: since.toISOString().split("T")[0],
      until: today.toISOString().split("T")[0],
    });
  } else {
    // Walk from oldest → newest in MAX_CHUNK_DAYS slices. We pull oldest first
    // so that if Meta starts rate-limiting halfway through, we still have the
    // historical baseline (the recent data is also picked up by the regular
    // 6-hour cron).
    const cursor = new Date(startDate);
    while (cursor < today) {
      const chunkEnd = new Date(cursor);
      chunkEnd.setDate(chunkEnd.getDate() + MAX_CHUNK_DAYS);
      if (chunkEnd > today) chunkEnd.setTime(today.getTime());
      chunks.push({
        since: cursor.toISOString().split("T")[0],
        until: chunkEnd.toISOString().split("T")[0],
      });
      cursor.setDate(cursor.getDate() + MAX_CHUNK_DAYS + 1);
    }
  }

  progress.onPlan?.(chunks);

  let allInsights: MetaInsight[] = [];
  let chunksSucceeded = 0;
  const failedChunks: InsightsSyncResult["failedChunks"] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    progress.onChunkStart?.(i, chunks.length, chunk);
    const timeRange = JSON.stringify(chunk);
    try {
      const chunkInsights = (await fetchAllPages(`act_${metaAccountId}/insights`, accessToken, {
        fields:
          "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,ctr,frequency,actions,date_start,date_stop",
        level: "ad",
        time_range: timeRange,
        time_increment: "1",
      })) as MetaInsight[];
      allInsights = allInsights.concat(chunkInsights);
      chunksSucceeded += 1;
      progress.onChunkEnd?.(i, chunks.length, chunk, { ok: true, rows: chunkInsights.length });
      log("info", "meta_api", `chunk ${i + 1}/${chunks.length} ok`, {
        since: chunk.since,
        until: chunk.until,
        rows: chunkInsights.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failedChunks.push({ since: chunk.since, until: chunk.until, error: msg });
      progress.onChunkEnd?.(i, chunks.length, chunk, { ok: false, error: msg });
      log("error", "meta_api", `chunk ${i + 1}/${chunks.length} failed`, {
        since: chunk.since,
        until: chunk.until,
        error: msg,
      });
    }
    // Throttle between chunks even on success — Meta tracks call rate per app.
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  interface Totals {
    adName: string;
    adsetId: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    ctrSum: number;
    freqSum: number;
    days: number;
  }
  const adTotals = new Map<string, Totals>();
  interface DailyRow {
    metaAdId: string;
    adsetId: string;
    date: string;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    cpl: number | null;
    ctr: number;
    frequency: number;
  }
  const dailyRows: DailyRow[] = [];

  for (const insight of allInsights) {
    const spend = parseFloat(insight.spend || "0");
    const impressions = parseInt(insight.impressions || "0");
    const clicks = parseInt(insight.clicks || "0");
    const frequency = parseFloat(insight.frequency || "0");
    const ctr = parseFloat(insight.ctr || "0");
    const dateStr = insight.date_start?.split("T")[0] || today.toISOString().split("T")[0];

    let convCount = 0;
    for (const action of insight.actions || []) {
      if (matchesActionType(action.action_type, costActionType)) {
        convCount += parseInt(action.value || "0");
      }
    }
    const cpl = convCount > 0 ? spend / convCount : null;

    const existing = adTotals.get(insight.ad_id) || {
      adName: insight.ad_name,
      adsetId: insight.adset_id,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      ctrSum: 0,
      freqSum: 0,
      days: 0,
    };
    existing.spend += spend;
    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.leads += convCount;
    existing.ctrSum += ctr;
    existing.freqSum += frequency;
    existing.days += 1;
    adTotals.set(insight.ad_id, existing);

    dailyRows.push({
      metaAdId: insight.ad_id,
      adsetId: insight.adset_id,
      date: dateStr,
      spend,
      impressions,
      clicks,
      leads: convCount,
      cpl,
      ctr,
      frequency,
    });
  }

  progress.onPersistStart?.(adTotals.size, dailyRows.length);

  // Upsert the aggregated totals onto metaAds.
  for (const [metaAdId, totals] of adTotals) {
    const adSet = await db.query.metaAdSets.findFirst({
      where: and(eq(metaAdSets.brandId, brandId), eq(metaAdSets.metaAdsetId, totals.adsetId)),
    });
    if (!adSet) continue;

    const aggCpl = totals.leads > 0 ? totals.spend / totals.leads : null;
    const aggCtr = totals.days > 0 ? totals.ctrSum / totals.days : null;
    const aggFreq = totals.days > 0 ? totals.freqSum / totals.days : null;

    await upsertAd(userId, brandId, adSet.id, {
      metaAdId,
      name: totals.adName,
      status: "ACTIVE",
      cpl: aggCpl,
      ctr: aggCtr,
      frequency: aggFreq,
      spend: totals.spend,
      impressions: totals.impressions,
      clicks: totals.clicks,
      leads: totals.leads,
    });
  }

  // Upsert daily insights.
  for (const row of dailyRows) {
    const ad = await db.query.metaAds.findFirst({
      where: and(eq(metaAds.brandId, brandId), eq(metaAds.metaAdId, row.metaAdId)),
    });
    if (!ad) continue;
    await upsertDailyInsight(userId, brandId, ad.id, {
      date: row.date,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      leads: row.leads,
      cpl: row.cpl,
      ctr: row.ctr,
      frequency: row.frequency,
    });
  }

  // Refresh status for any ads that Meta has turned off/on.
  const statusAds = await fetchAllPages(`act_${metaAccountId}/ads`, accessToken, {
    fields: "id,status",
  });
  for (const raw of statusAds as Array<Record<string, string>>) {
    const ad = await db.query.metaAds.findFirst({
      where: and(eq(metaAds.brandId, brandId), eq(metaAds.metaAdId, raw.id)),
    });
    if (!ad) continue;
    if (ad.status !== raw.status) {
      await db.update(metaAds).set({ status: raw.status }).where(eq(metaAds.id, ad.id));
    }
  }

  return {
    ads: adTotals.size,
    chunksTotal: chunks.length,
    chunksSucceeded,
    chunksFailed: failedChunks.length,
    failedChunks,
  };
}
