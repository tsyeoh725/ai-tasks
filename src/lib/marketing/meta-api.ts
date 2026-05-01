// Meta Marketing API wrapper — ported from jarvis/src/lib/services/meta-api.ts
// Access tokens are passed in as parameters (no direct env reads) so the caller
// can source the token from a DB row (brands.metaAccessToken) or per-user pref.
import { log } from "@/lib/marketing/logger";

const META_API_BASE = "https://graph.facebook.com/v21.0";

export interface DateRange {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

export interface MetaInsight {
  ad_id: string;
  ad_name: string;
  adset_id: string;
  campaign_id: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  frequency: string;
  date_start: string;
  date_stop: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface MetaAdRecord {
  id: string; // meta ad id
  name: string;
  status: string;
  adset_id: string;
  campaign_id: string;
  insights?: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    frequency: number;
    leads: number;
    cpl: number | null;
  };
}

// --- Low-level fetch helpers ---

async function metaFetch(
  endpoint: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<{ data?: unknown[]; paging?: { next?: string } } & Record<string, unknown>> {
  const parts: string[] = [`access_token=${encodeURIComponent(accessToken)}`];
  for (const [k, v] of Object.entries(params)) {
    parts.push(`${k}=${encodeURIComponent(v)}`);
  }

  const url = `${META_API_BASE}/${endpoint}?${parts.join("&")}`;
  log("debug", "meta_api", `Request: GET ${endpoint}`, {
    params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== "access_token")),
  });

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log("error", "meta_api", `Response error: ${res.status}`, { endpoint, error: err });
    throw new Error(`Meta API error: ${res.status} - ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  log("debug", "meta_api", `Response OK: ${endpoint}`, {
    resultCount: Array.isArray(data.data) ? data.data.length : "N/A",
  });
  return data;
}

async function fetchAllPages(
  endpoint: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<unknown[]> {
  const results: unknown[] = [];

  const firstPage = await metaFetch(endpoint, accessToken, { ...params, limit: "500" });
  results.push(...((firstPage.data as unknown[]) || []));

  let nextUrl = firstPage.paging?.next || null;
  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) break;
    const page = (await res.json()) as { data?: unknown[]; paging?: { next?: string } };
    results.push(...(page.data || []));
    nextUrl = page.paging?.next || null;
  }

  return results;
}

function matchesActionType(metaActionType: string, configuredType: string): boolean {
  if (metaActionType === configuredType) return true;
  const coreParts = configuredType.replace(/^(onsite_conversion\.|offsite_conversion\.)/, "");
  if (metaActionType.includes(coreParts)) return true;
  if (metaActionType === `${configuredType}_grouped`) return true;
  return false;
}

// --- Public API ---

/**
 * Test that the provided access token is valid.
 */
export async function testConnection(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${META_API_BASE}/me?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: JSON.stringify(err) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Fetch active ads for a brand along with aggregated insights over `dateRange` days.
 * This does NOT write to the DB — callers decide how to persist.
 */
export async function getMetaAdsForBrand(
  metaAccountId: string,
  accessToken: string,
  dateRange: number = 7,
  costActionType: string = "lead",
): Promise<MetaAdRecord[]> {
  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - dateRange);

  const timeRange = JSON.stringify({
    since: since.toISOString().split("T")[0],
    until: today.toISOString().split("T")[0],
  });

  // Pull insights at ad level (aggregated — no time_increment)
  const insights = (await fetchAllPages(`act_${metaAccountId}/insights`, accessToken, {
    fields: "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,ctr,frequency,actions,date_start,date_stop",
    level: "ad",
    time_range: timeRange,
  })) as MetaInsight[];

  // Pull ad status / names (insights can lag behind status changes)
  const adsRaw = (await fetchAllPages(`act_${metaAccountId}/ads`, accessToken, {
    fields: "id,name,status,adset_id,campaign_id",
  })) as Array<{
    id: string;
    name: string;
    status: string;
    adset_id: string;
    campaign_id: string;
  }>;

  const insightsByAdId = new Map<string, MetaInsight>();
  for (const i of insights) insightsByAdId.set(i.ad_id, i);

  return adsRaw.map((ad) => {
    const i = insightsByAdId.get(ad.id);
    if (!i) {
      return { id: ad.id, name: ad.name, status: ad.status, adset_id: ad.adset_id, campaign_id: ad.campaign_id };
    }
    const spend = parseFloat(i.spend || "0");
    const impressions = parseInt(i.impressions || "0");
    const clicks = parseInt(i.clicks || "0");
    const ctr = parseFloat(i.ctr || "0");
    const frequency = parseFloat(i.frequency || "0");

    let leads = 0;
    for (const a of i.actions || []) {
      if (matchesActionType(a.action_type, costActionType)) {
        leads += parseInt(a.value || "0");
      }
    }
    const cpl = leads > 0 ? spend / leads : null;

    return {
      id: ad.id,
      name: ad.name,
      status: ad.status,
      adset_id: ad.adset_id,
      campaign_id: ad.campaign_id,
      insights: { spend, impressions, clicks, ctr, frequency, leads, cpl },
    };
  });
}

/**
 * Pull historical insights for a longer time range (chunked by 180 days).
 */
export async function getHistoricalData(
  metaAccountId: string,
  accessToken: string,
  months: number,
  costActionType: string = "lead",
): Promise<MetaInsight[]> {
  const MAX_CHUNK_DAYS = 180;
  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - Math.min(months, 36));

  const chunks: DateRange[] = [];
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

  const all: MetaInsight[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const timeRange = JSON.stringify(chunks[i]);
    const rows = (await fetchAllPages(`act_${metaAccountId}/insights`, accessToken, {
      fields: "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,ctr,frequency,actions,date_start,date_stop",
      level: "ad",
      time_range: timeRange,
      time_increment: "1",
    })) as MetaInsight[];
    all.push(...rows);
    // Mark costActionType so it's visible in logs (keeps the parameter "used")
    log("debug", "meta_api", `Historical chunk ${i + 1}/${chunks.length}`, {
      since: chunks[i].since,
      until: chunks[i].until,
      rows: rows.length,
      costActionType,
    });
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return all;
}

/**
 * Set an ad's status to PAUSED.
 */
export async function pauseAd(adId: string, accessToken: string): Promise<unknown> {
  return updateAdStatus(adId, "PAUSED", accessToken);
}

/**
 * Set an ad's status to ACTIVE.
 */
export async function activateAd(adId: string, accessToken: string): Promise<unknown> {
  return updateAdStatus(adId, "ACTIVE", accessToken);
}

export async function updateAdStatus(
  metaAdId: string,
  status: "PAUSED" | "ACTIVE",
  accessToken: string,
): Promise<unknown> {
  log("info", "meta_api", `Updating ad status: ${metaAdId} -> ${status}`);
  const res = await fetch(`${META_API_BASE}/${metaAdId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log("error", "meta_api", `Failed to update ad ${metaAdId}`, { status, error: err });
    throw new Error(`Failed to update ad status: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  log("info", "meta_api", `Ad ${metaAdId} status updated to ${status}`, { response: data });
  return data;
}

export async function updateAdSetBudget(
  metaAdSetId: string,
  newDailyBudget: number,
  accessToken: string,
): Promise<unknown> {
  const budgetInCents = Math.round(newDailyBudget * 100);
  log("info", "meta_api", `Updating budget: ${metaAdSetId} -> ${newDailyBudget}`, { budgetInCents });
  const res = await fetch(`${META_API_BASE}/${metaAdSetId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ daily_budget: budgetInCents, access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log("error", "meta_api", `Failed to update budget ${metaAdSetId}`, { error: err });
    throw new Error(`Failed to update budget: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export async function updateCampaignBudget(
  metaCampaignId: string,
  newBudget: number,
  type: "daily" | "lifetime",
  accessToken: string,
): Promise<unknown> {
  const budgetInCents = Math.round(newBudget * 100);
  const budgetField = type === "daily" ? "daily_budget" : "lifetime_budget";
  log("info", "meta_api", `Updating campaign ${type} budget: ${metaCampaignId} -> ${newBudget}`, { budgetInCents });
  const res = await fetch(`${META_API_BASE}/${metaCampaignId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [budgetField]: budgetInCents, access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    log("error", "meta_api", `Failed to update campaign budget ${metaCampaignId}`, { error: err });
    throw new Error(`Failed to update campaign budget: ${JSON.stringify(err)}`);
  }
  return res.json();
}

export async function duplicateAd(
  metaAdId: string,
  targetAdSetId: string,
  accessToken: string,
): Promise<{ copied_ad_id?: string } & Record<string, unknown>> {
  log("info", "meta_api", `Duplicating ad ${metaAdId} to adset ${targetAdSetId}`);

  // Read the original creative so we can override standard_enhancements
  const adData = (await metaFetch(metaAdId, accessToken, {
    fields: "name,creative{id,name,object_story_spec,asset_feed_spec,url_tags,thumbnail_url}",
  })) as { creative?: { id?: string } };

  const creative = adData?.creative;

  const params = new URLSearchParams();
  params.set("access_token", accessToken);
  params.set("adset_id", targetAdSetId);
  params.set("status_option", "INHERITED_FROM_SOURCE");
  params.set("rename_options", JSON.stringify({ rename_suffix: " (Copy)" }));

  if (creative?.id) {
    params.set(
      "creative",
      JSON.stringify({
        creative_id: creative.id,
        standard_enhancements: { enroll_status: "OPT_OUT" },
      }),
    );
  }

  const res = await fetch(`${META_API_BASE}/${metaAdId}/copies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Retry without creative override if standard_enhancements is the blocker
    if ((err as { error?: { error_subcode?: number } })?.error?.error_subcode === 3858504) {
      log("warn", "meta_api", `Retrying duplicate without creative override for ${metaAdId}`);
      const retryParams = new URLSearchParams();
      retryParams.set("access_token", accessToken);
      retryParams.set("adset_id", targetAdSetId);
      retryParams.set("status_option", "INHERITED_FROM_SOURCE");
      retryParams.set("rename_options", JSON.stringify({ rename_suffix: " (Copy)" }));
      retryParams.set("updated_fields", JSON.stringify(["name"]));

      const retryRes = await fetch(`${META_API_BASE}/${metaAdId}/copies`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: retryParams.toString(),
      });

      if (!retryRes.ok) {
        const retryErr = await retryRes.json().catch(() => ({}));
        log("error", "meta_api", `Retry also failed for ${metaAdId}`, { error: retryErr });
        throw new Error(`Failed to duplicate ad: ${JSON.stringify(retryErr)}`);
      }

      return retryRes.json();
    }

    log("error", "meta_api", `Failed to duplicate ad ${metaAdId}`, { error: err });
    throw new Error(`Failed to duplicate ad: ${JSON.stringify(err)}`);
  }

  return res.json();
}
