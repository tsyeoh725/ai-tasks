// Meta adapter — implements AdPlatform by wrapping the existing function
// modules in this folder (./api for Graph API calls, ./sync for sync flows).
//
// This file does NOT contain Meta-specific business logic of its own — every
// method delegates to a function imported from ./api or ./sync. The role of
// this adapter is:
//   1. Extract the access token from a Credential (kind-discriminated)
//   2. Pull the brand's metaAccountId out of PlatformContext
//   3. Map Meta's wire format (MetaAdRecord, snake_case) to the platform-
//      agnostic types in ../types (AdRecord, camelCase) — only where callers
//      need the agnostic shape
//
// Phase 2 ships the adapter without wiring any caller to it. Phase 5 cuts
// core-monitor / scheduler / action-executor over to call the adapter via
// the upcoming credential provider.

import type {
  AdPlatform,
  AdRecord,
  CampaignBudgetType,
  Credential,
  DuplicateAdOptions,
  GetAdsOptions,
  GetHistoricalOptions,
  HistoricalInsightRow,
  InsightsProgressCallbacks,
  InsightsSyncResult,
  PlatformContext,
  SyncInsightsOptions,
} from "../types";

import {
  type MetaAdRecord,
  type MetaInsight,
  testConnection as apiTestConnection,
  getMetaAdsForBrand,
  getHistoricalData,
  pauseAd as apiPauseAd,
  activateAd as apiActivateAd,
  updateAdStatus as apiUpdateAdStatus,
  updateAdSetBudget as apiUpdateAdSetBudget,
  updateCampaignBudget as apiUpdateCampaignBudget,
  duplicateAd as apiDuplicateAd,
} from "./api";

import {
  type InsightsProgress,
  syncCampaigns as apiSyncCampaigns,
  syncAdSets as apiSyncAdSets,
  syncAdsWithInsights as apiSyncAdsWithInsights,
} from "./sync";

// ============================================================================
// Helpers
// ============================================================================

function extractToken(credential: Credential): string {
  switch (credential.kind) {
    case "system_user_token":
      return credential.token;
    case "oauth_refresh":
      return credential.accessToken;
    default: {
      // Exhaustiveness check — TypeScript will error here if a new credential
      // kind is added to the union without updating this switch.
      const _exhaustive: never = credential;
      throw new Error(
        `Unhandled credential kind: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}

function requireMetaAccountId(ctx: PlatformContext): string {
  const id = ctx.brand.metaAccountId;
  if (!id) {
    throw new Error(
      `Brand ${ctx.brandId} has no metaAccountId — cannot call Meta APIs.`,
    );
  }
  return id;
}

function mapMetaAdToAdRecord(m: MetaAdRecord): AdRecord {
  return {
    id: m.id,
    name: m.name,
    status: m.status,
    adSetId: m.adset_id,
    campaignId: m.campaign_id,
    insights: m.insights,
  };
}

// `InsightsProgressCallbacks` (in ../types) and `InsightsProgress` (in ./sync)
// are structurally identical — TypeScript accepts the implicit conversion. The
// alias keeps intent clear at the call site if we ever diverge them.
function asLegacyProgress(
  cb: InsightsProgressCallbacks | undefined,
): InsightsProgress | undefined {
  return cb;
}

// ============================================================================
// Adapter
// ============================================================================

export const metaAdapter: AdPlatform = {
  id: "meta",

  // ---- Reads — pull state into our DB ----

  async syncCampaigns(ctx: PlatformContext): Promise<number> {
    const token = extractToken(ctx.credential);
    const accountId = requireMetaAccountId(ctx);
    return apiSyncCampaigns(accountId, ctx.brandId, ctx.brand.userId, token);
  },

  async syncAdSets(ctx: PlatformContext): Promise<number> {
    const token = extractToken(ctx.credential);
    const accountId = requireMetaAccountId(ctx);
    return apiSyncAdSets(accountId, ctx.brandId, ctx.brand.userId, token);
  },

  async syncAdsWithInsights(
    ctx: PlatformContext,
    options?: SyncInsightsOptions,
    progress?: InsightsProgressCallbacks,
  ): Promise<InsightsSyncResult> {
    const token = extractToken(ctx.credential);
    const accountId = requireMetaAccountId(ctx);
    return apiSyncAdsWithInsights(
      accountId,
      ctx.brandId,
      ctx.brand.userId,
      token,
      options?.dateRangeDays,
      options?.costActionType,
      asLegacyProgress(progress),
    );
  },

  // ---- Reads — fetch live ----

  async getAds(
    ctx: PlatformContext,
    options?: GetAdsOptions,
  ): Promise<AdRecord[]> {
    const token = extractToken(ctx.credential);
    const accountId = requireMetaAccountId(ctx);
    const ads = await getMetaAdsForBrand(
      accountId,
      token,
      options?.dateRangeDays,
      options?.costActionType,
    );
    return ads.map(mapMetaAdToAdRecord);
  },

  async getHistoricalInsights(
    ctx: PlatformContext,
    options: GetHistoricalOptions,
  ): Promise<HistoricalInsightRow[]> {
    const token = extractToken(ctx.credential);
    const accountId = requireMetaAccountId(ctx);
    const rows: MetaInsight[] = await getHistoricalData(
      accountId,
      token,
      options.months,
      options.costActionType,
    );
    return rows;
  },

  async testConnection(
    ctx: PlatformContext,
  ): Promise<{ ok: boolean; error?: string }> {
    const token = extractToken(ctx.credential);
    return apiTestConnection(token);
  },

  // ---- Writes ----

  async pauseAd(ctx: PlatformContext, adId: string): Promise<unknown> {
    const token = extractToken(ctx.credential);
    return apiPauseAd(adId, token);
  },

  async activateAd(ctx: PlatformContext, adId: string): Promise<unknown> {
    const token = extractToken(ctx.credential);
    return apiActivateAd(adId, token);
  },

  async updateAdStatus(
    ctx: PlatformContext,
    adId: string,
    status: "ACTIVE" | "PAUSED",
  ): Promise<unknown> {
    const token = extractToken(ctx.credential);
    return apiUpdateAdStatus(adId, status, token);
  },

  async updateAdSetBudget(
    ctx: PlatformContext,
    adSetId: string,
    newDailyBudget: number,
  ): Promise<unknown> {
    const token = extractToken(ctx.credential);
    return apiUpdateAdSetBudget(adSetId, newDailyBudget, token);
  },

  async updateCampaignBudget(
    ctx: PlatformContext,
    campaignId: string,
    newBudget: number,
    type: CampaignBudgetType,
  ): Promise<unknown> {
    const token = extractToken(ctx.credential);
    return apiUpdateCampaignBudget(campaignId, newBudget, type, token);
  },

  async duplicateAd(
    ctx: PlatformContext,
    adId: string,
    opts: DuplicateAdOptions,
  ): Promise<unknown> {
    // Note: Meta's duplicate-ad endpoint doesn't accept a copy-name override
    // today; opts.copyName is silently ignored. When that capability lands
    // we'll thread it through.
    const token = extractToken(ctx.credential);
    return apiDuplicateAd(adId, opts.targetAdSetId, token);
  },

  // ---- Optional MCP-era signals ----
  // Not implemented yet. They'll arrive when we wire the Meta CLI / HTTP MCP
  // (post-refactor work). Adapters that don't implement an optional capability
  // simply omit the method; callers null-check via `if (adapter.getXxx)`.
};
