// Cross-platform ad-platform abstractions.
//
// See docs/architecture.md for the contract this file establishes:
//   - AdPlatform — every third-party ads API call goes behind this interface
//   - CredentialProvider — platform code never knows token kind
//   - The action enum / Recommendation are intentionally NOT generic; we use a
//     `platform: PlatformId` discriminator on Recommendation in a later phase.
//
// Phase 1 ships pure types only. No logic. No new dependencies. Existing
// src/lib/marketing/* code is unchanged and unaware of this file.

// ============================================================================
// Identity
// ============================================================================

export type PlatformId = "meta" | "google" | "tiktok";

// ============================================================================
// Credentials
// ============================================================================
//
// Adapters never read tokens directly. They receive a Credential through
// PlatformContext and treat it as opaque except for the `kind` discriminator.
// New auth modes (e.g. OAuth refresh for the HTTP MCP) slot in by extending
// the union.

export type Credential =
  | { kind: "system_user_token"; token: string }
  | {
      kind: "oauth_refresh";
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    };

export interface CredentialProvider {
  readonly platform: PlatformId;
  getCredential(brandId: string): Promise<Credential>;
}

// ============================================================================
// Per-call context
// ============================================================================
//
// Every adapter method receives a PlatformContext rather than ad-hoc args.
// This keeps signatures stable as we add cross-cutting concerns (rate-limit
// budgets, request IDs for tracing, dry-run flags, etc.) without churning
// every method.

export interface PlatformContext {
  brandId: string;
  brand: BrandSummary;
  credential: Credential;
}

export interface BrandSummary {
  id: string;
  userId: string;
  /** Meta ad account ID (numeric, no `act_` prefix). Set per Meta-connected brand. */
  metaAccountId?: string | null;
  // Future: googleCustomerId, tiktokAdvertiserId, etc. Each platform adds the
  // field it needs; the adapter narrows on the fields it cares about.
}

// ============================================================================
// Shared value types
// ============================================================================

export interface DateRange {
  /** YYYY-MM-DD */
  since: string;
  /** YYYY-MM-DD */
  until: string;
}

/**
 * Platform-agnostic ad record. Concrete adapters map their wire format
 * (Meta's snake_case Graph response, Google's REST shape, etc.) into this.
 */
export interface AdRecord {
  /** Platform-side ad ID (numeric for Meta, opaque for others) */
  id: string;
  name: string;
  /** Platform-defined status enum, normalised to the platform's casing */
  status: string;
  adSetId: string;
  campaignId: string;
  insights?: AdInsightsSummary;
}

export interface AdInsightsSummary {
  /** Currency-normalised, dollars */
  spend: number;
  impressions: number;
  clicks: number;
  /** 0–1 fraction (not a 0–100 percentage) */
  ctr: number;
  frequency: number;
  /** Conversions matching the brand's costMetric */
  leads: number;
  /** Cost per lead, or null when leads === 0 */
  cpl: number | null;
}

/**
 * Per-day historical rows for a single ad. Shape stays platform-shaped for now
 * (we don't have a normalised need yet); Phase 2 may refine when callers force
 * the issue.
 */
export type HistoricalData = unknown;

// ============================================================================
// Sync workflow types
// ============================================================================

export interface InsightsSyncResult {
  ads: number;
  chunksTotal: number;
  chunksSucceeded: number;
  chunksFailed: number;
  failedChunks: Array<{ since: string; until: string; error: string }>;
}

export interface SyncInsightsOptions {
  /** How many days back to pull. Default: 7. */
  dateRangeDays?: number;
  /** Which Meta-style action_type counts as a conversion. Default: "lead". */
  costActionType?: string;
}

export interface InsightsProgressCallbacks {
  /** Called once with the chunk plan before the first fetch. */
  onPlan?: (chunks: Array<{ since: string; until: string }>) => void;
  /** Called immediately before each chunk fetch. */
  onChunkStart?: (
    index: number,
    total: number,
    chunk: { since: string; until: string },
  ) => void;
  /** Called after each chunk completes, succeeded or failed. */
  onChunkEnd?: (
    index: number,
    total: number,
    chunk: { since: string; until: string },
    result: { ok: true; rows: number } | { ok: false; error: string },
  ) => void;
  /** Called after the per-chunk loop finishes, before the upserts run. */
  onPersistStart?: (totalAds: number, totalDailyRows: number) => void;
}

// ============================================================================
// Action types (writes)
// ============================================================================

/**
 * Universal action intents. The four words below mean the same thing on Meta,
 * Google Ads and TikTok — only the underlying API shape differs (handled by
 * the adapter, not by callers).
 */
export type ActionKind = "kill" | "pause" | "boost_budget" | "duplicate";

export interface DuplicateOpts {
  /** Override the new ad's name; defaults to "<original> (copy)". */
  copyName?: string;
}

// ============================================================================
// New post-MCP signals (optional capability per platform)
// ============================================================================
//
// Marked optional on the AdPlatform interface so non-Meta adapters can ship
// without implementing them. Callers must null-check.

export interface BenchmarkSnapshot {
  ctrMedian?: number;
  cplMedian?: number;
  cpmMedian?: number;
}

export type RankingBucket = "above_average" | "average" | "below_average";

export interface AuctionRanking {
  qualityRanking?: RankingBucket;
  engagementRateRanking?: RankingBucket;
  conversionRateRanking?: RankingBucket;
}

export type AnomalySeverity = "low" | "medium" | "high";

export interface AnomalySignal {
  /** Platform-defined kind, e.g. "cpl_spike", "learning_phase_break" */
  kind: string;
  severity: AnomalySeverity;
  description: string;
  detectedAt: Date;
}

// ============================================================================
// The interface
// ============================================================================

export interface AdPlatform {
  readonly id: PlatformId;

  // ---- Reads: pull state into our DB ----

  syncCampaigns(ctx: PlatformContext): Promise<number>;
  syncAdSets(ctx: PlatformContext): Promise<number>;
  syncAdsWithInsights(
    ctx: PlatformContext,
    options?: SyncInsightsOptions,
    progress?: InsightsProgressCallbacks,
  ): Promise<InsightsSyncResult>;

  // ---- Reads: fetch live ----

  getAds(ctx: PlatformContext, range: DateRange): Promise<AdRecord[]>;
  getHistoricalData(
    ctx: PlatformContext,
    adId: string,
    days: number,
  ): Promise<HistoricalData>;
  testConnection(
    ctx: PlatformContext,
  ): Promise<{ ok: boolean; error?: string }>;

  // ---- Writes ----
  //
  // Return types are `unknown` on purpose — callers care about success/failure
  // (thrown errors), not response shape. Action executor logs raw responses to
  // marketing_audit_log for forensics; nothing introspects them.

  pauseAd(ctx: PlatformContext, adId: string): Promise<unknown>;
  activateAd(ctx: PlatformContext, adId: string): Promise<unknown>;
  updateAdStatus(
    ctx: PlatformContext,
    adId: string,
    status: "ACTIVE" | "PAUSED",
  ): Promise<unknown>;
  updateAdSetBudget(
    ctx: PlatformContext,
    adSetId: string,
    dailyBudgetCents: number,
  ): Promise<unknown>;
  updateCampaignBudget(
    ctx: PlatformContext,
    campaignId: string,
    dailyBudgetCents: number,
  ): Promise<unknown>;
  duplicateAd(
    ctx: PlatformContext,
    adId: string,
    opts?: DuplicateOpts,
  ): Promise<unknown>;

  // ---- Optional capabilities (Phase 2+) ----

  getIndustryBenchmark?(
    ctx: PlatformContext,
    adSetId: string,
  ): Promise<BenchmarkSnapshot>;
  getAuctionRanking?(
    ctx: PlatformContext,
    adId: string,
  ): Promise<AuctionRanking>;
  getAnomalySignals?(
    ctx: PlatformContext,
    adId: string,
  ): Promise<AnomalySignal[]>;
  getOpportunityScore?(ctx: PlatformContext, adId: string): Promise<number>;
}
