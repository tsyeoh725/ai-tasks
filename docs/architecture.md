# ai-tasks — Marketing Platform Architecture

**Status:** Living doc. Updated each phase of the refactor.
**Owner:** Sheng + Claude.
**Why this exists:** Today the codebase has Meta hardcoded everywhere. Within 18 months we'll want Google Ads, TikTok Ads, and (likely) MCP-only Meta as Graph API deprecates. This doc names the three abstractions that absorb that change without rewrites.

---

## The three abstractions

Every PR that touches marketing code MUST fit one of these. If a change doesn't fit, push back or revise the doc.

### 1. `AdPlatform` — what we can do on a platform

Anything that calls a third-party ads API goes behind this interface. Meta is the first implementation. Google / TikTok will be future implementations.

```ts
// src/lib/ad-platforms/types.ts
export type PlatformId = "meta" | "google" | "tiktok";

export interface AdPlatform {
  readonly id: PlatformId;

  // Reads — pull state into our DB
  syncCampaigns(ctx: PlatformContext): Promise<number>;
  syncAdSets(ctx: PlatformContext): Promise<number>;
  syncAdsWithInsights(ctx: PlatformContext, range: DateRange, onProgress?: ProgressFn): Promise<InsightsSyncResult>;

  // Reads — fetch live
  getAds(ctx: PlatformContext, range: DateRange): Promise<AdRecord[]>;
  getHistoricalData(ctx: PlatformContext, adId: string, days: number): Promise<HistoricalData>;
  testConnection(ctx: PlatformContext): Promise<{ ok: boolean; error?: string }>;

  // Writes
  pauseAd(ctx: PlatformContext, adId: string): Promise<unknown>;
  activateAd(ctx: PlatformContext, adId: string): Promise<unknown>;
  updateAdStatus(ctx: PlatformContext, adId: string, status: "ACTIVE" | "PAUSED"): Promise<unknown>;
  updateAdSetBudget(ctx: PlatformContext, adSetId: string, dailyBudgetCents: number): Promise<unknown>;
  updateCampaignBudget(ctx: PlatformContext, campaignId: string, dailyBudgetCents: number): Promise<unknown>;
  duplicateAd(ctx: PlatformContext, adId: string, opts: DuplicateOpts): Promise<unknown>;

  // New post-MCP signals (Phase 2+; optional capability per platform)
  getIndustryBenchmark?(ctx: PlatformContext, adSetId: string): Promise<BenchmarkSnapshot>;
  getAuctionRanking?(ctx: PlatformContext, adId: string): Promise<AuctionRanking>;
  getAnomalySignals?(ctx: PlatformContext, adId: string): Promise<AnomalySignal[]>;
  getOpportunityScore?(ctx: PlatformContext, adId: string): Promise<number>;
}

export interface PlatformContext {
  brandId: string;
  brand: { id: string; userId: string; metaAccountId?: string | null; /* ... */ };
  credential: Credential;
}
```

**Where it lives:**
- `src/lib/ad-platforms/types.ts` — the interface and shared types
- `src/lib/ad-platforms/meta/index.ts` — Meta adapter
- `src/lib/ad-platforms/meta/api.ts` — moved from `src/lib/marketing/meta-api.ts`
- `src/lib/ad-platforms/meta/sync.ts` — moved from `src/lib/marketing/sync.ts`
- `src/lib/ad-platforms/registry.ts` — `getAdPlatform(id: PlatformId): AdPlatform`

**Existing files keep working during migration.** `src/lib/marketing/meta-api.ts` becomes a thin re-export from the adapter so callers don't break mid-refactor.

### 2. `CredentialProvider` — how we authenticate

Platform code never knows what kind of token it's holding. It calls `getCredential(brandId)` and gets something back.

```ts
// src/lib/ad-platforms/types.ts
export type Credential =
  | { kind: "system_user_token"; token: string }
  | { kind: "oauth_refresh"; accessToken: string; refreshToken: string; expiresAt: Date };

export interface CredentialProvider {
  readonly platform: PlatformId;
  getCredential(brandId: string): Promise<Credential>;
}
```

**First implementation:** `MetaSystemUserCredential` — extracts the existing `resolveMetaAccessToken` resolver. Same 3-tier priority (brand override → globalSettings → env). Returns `{ kind: "system_user_token", token }`.

**Future implementations slot in cleanly:**
- `MetaOAuthCredential` — Plan B. Stores refresh token, refreshes on expiry, returns `{ kind: "oauth_refresh", accessToken, ... }`.
- `GoogleAdsCredential` — when Google Ads is added.

**Where it lives:** `src/lib/ad-platforms/credentials/`

### 3. `Recommendation` + `ActionKind` — what the AI Guard outputs

Today the `Recommendation` type in `claude-guard.ts` hardcodes `RecommendationAction = "kill" | "pause" | "boost_budget" | "duplicate"` and is implicitly Meta-shaped. Those four action words happen to mean the same intent on Google Ads and TikTok too — only the underlying API shape differs.

We considered making `Recommendation` generic over a `PlatformActionPayload[TPlatform]` type. **Decided against** — YAGNI. The Recommendation only needs to say *"do action X on ad Y, on platform P"*. The platform-specific knowledge (which API endpoint, which fields) lives in the `AdPlatform` adapter, where it belongs. The executor reads `recommendation.platform`, dispatches to the right adapter, done.

```ts
// src/lib/ad-platforms/types.ts (Phase 1 — already lives here)
export type ActionKind = "kill" | "pause" | "boost_budget" | "duplicate";

// Phase 4 will add `platform: PlatformId` to the existing Recommendation
// in claude-guard.ts. No generics, no payload type. Existing fields
// (kpiValues, thresholds, maturity, recentActions) stay as-is — they're
// already platform-agnostic in shape.
```

**Net effect:** AI Guard prompts stay platform-agnostic (they already are). The executor reads `recommendation.platform`, dispatches to the right adapter. Decision Journal records `platform` column for cross-platform analytics.

---

## Schema strategy: do NOT rename existing tables

We considered renaming `meta_campaigns` → `ad_campaigns` with a `platform` discriminator. Decided against:

- **High migration risk** for one-time benefit
- **Existing queries everywhere** would need updates simultaneously
- Each platform has distinct field shapes (Meta has `objective`, Google has `bidding_strategy`, TikTok has `optimization_goal`) — a single unified table either loses those fields or becomes a sparse mess

**Rule:** Each platform owns its own tables. `meta_campaigns` stays. When Google Ads ships, that PR adds `google_campaigns`. The `AdPlatform` adapter knows which tables to query.

The only platform-level change to existing tables: **add `platform: PlatformId` to `decision_journal`** so cross-platform queries work for AI Guard analytics later. Default `'meta'` for existing rows. New column, not a rename.

---

## Migration phases

| # | Phase | Files touched | Days | Done |
|---|---|---|---|---|
| 0 | Architecture doc | `docs/architecture.md` (this) | 0.5 | ✅ `6124c86` |
| 1 | Interface skeletons | `src/lib/ad-platforms/types.ts` (new) | 0.5 | ✅ `061a3b4` |
| 2a | Move `meta-api.ts` → `ad-platforms/meta/api.ts` | re-export shim | 0.5 | ✅ `f384bf0` |
| 2b | Move `sync.ts` → `ad-platforms/meta/sync.ts` | re-export shim | 0.5 | ✅ `87b8db4` |
| 2c | `metaAdapter` implements `AdPlatform` | `meta/index.ts` (new) + types reconciled | 1 | ✅ `dd8ef44` |
| 3 | Credential provider | `credentials/meta-system-user.ts` (new); `meta-token.ts` becomes re-export | 1 | ✅ `8a0dbdc` |
| 4 | `platform: PlatformId` field on `Recommendation` | `claude-guard.ts`, `core-monitor.ts`, `action-executor.ts` | 0.5 | ✅ `244fe55` |
| 5a | Registry — `getAdPlatform`, `getCredentialProvider`, `buildPlatformContext` | `registry.ts` (new) | 0.5 | ✅ `8ae63ae` |
| 5b | `action-executor` write path through adapter | `action-executor.ts` | 1 | ✅ `2c7d665` |
| 5c | Sync-flow callers (`automation-runner`, sync routes) | 3 files | 1 | ✅ `470ebfd` |
| 6a | Remaining shim callers (health, test-meta, meta-ads/action, ai-tools) | 4 files | 0.5 | ✅ `6b8de4c` |
| 6b | Delete shims + finalise this doc | 3 deletions + this doc | 0.5 | ✅ |

Each phase committed to `main` with `tsc --noEmit` clean. System stayed runnable throughout. No long-lived refactor branch.

**Net diff:** ~10 commits; ~1300 lines added, ~600 lines moved/restructured. Functional behaviour unchanged — every Meta call still ends up in the same `meta/api.ts` / `meta/sync.ts` functions, just routed through `AdPlatform` + `CredentialProvider`.

---

## Rules of the road

1. **Every phase ships.** No long-lived refactor branch. If a phase grows past its budget, scope down.
2. **No new features during refactor.** Bug fixes go through old code; do not bundle into the refactor commits.
3. **Re-exports during migration.** `src/lib/marketing/meta-api.ts` re-exports from `ad-platforms/meta` so callers don't break mid-phase. Cleaned up in Phase 6.
4. **Decision Journal carries platform.** Every new journal row gets `platform: 'meta'`. Existing rows backfilled by migration default.
5. **No platform-specific code outside `src/lib/ad-platforms/<platform>/`.** If you find yourself writing `if (platform === 'meta')` outside the adapter, push it down into the adapter instead.

---

## Do NOT do

- ❌ Rename `meta_campaigns` to `ad_campaigns`. Future-only complexity, no current benefit.
- ❌ Build a generic ORM model that "supports any ads platform". Schema diversity is real; let each platform have its own tables.
- ❌ Add Google Ads / TikTok scaffolding "while we're refactoring." First platform = Meta only. Second platform = its own focused PR after refactor lands.
- ❌ Split `claude-guard.ts` per platform. Prompts are platform-agnostic; only the action payload type is generic.
- ❌ Switch `claude-guard.ts` from Anthropic SDK direct to Vercel AI SDK in this refactor. Out of scope.
- ❌ Touch the approvals UI, executor logic, or AI Guard prompts. Out of scope.
- ❌ Migrate database engine. SQLite stays.
- ❌ Build feature flags / fixtures / eval harness in this refactor. Those are Tier 1 (do later, see bottom of doc).

---

## What we're NOT solving in this refactor (deferred Tier 1)

These were on the senior-engineer list but are deferred to keep the refactor focused. Track separately when this lands:

- Per-workspace feature flags
- API response fixtures + replay tests for Meta CLI version drift
- Eval harness for AI Guard prompt regressions
- Per-workspace cost telemetry
- `metaTokens` encryption-key recovery runbook
- Webhook trigger support in `cycle_runs`

---

## After the refactor — what becomes easy

| Task | Pre-refactor cost | Post-refactor cost |
|---|---|---|
| Wire Meta CLI subprocess (Plan A) | 2–3 wks | 1 wk |
| Wire MCP via OAuth (Plan B) | 4–5 wks | 2–3 wks |
| Add Google Ads | full rewrite (4+ wks) | 1 wk for first cut |
| Add TikTok Ads | full rewrite | 1 wk |
| Force BP-required onboarding | 0.5 wk (UI) | same — orthogonal |
| Per-platform AI Guard prompts | 2 wks (untangle Meta from prompt) | 0 — already split |

### How to add a second platform (recipe)

1. Implement `AdPlatform` at `src/lib/ad-platforms/<platform>/index.ts` (use `meta/index.ts` as the reference).
2. Implement at least one `CredentialProvider` at `src/lib/ad-platforms/credentials/<platform>-<auth-mode>.ts`.
3. Register both in `src/lib/ad-platforms/registry.ts` under the new `PlatformId`.
4. Add the platform's tables to `src/db/schema.ts` (e.g. `google_campaigns`, `google_ads`). Adapter calls these directly — there is **no shared `ad_campaigns` table**.
5. Extend the `PlatformId` union in `types.ts`.
6. Add platform-specific fields to `BrandSummary` in `types.ts` if needed (e.g. `googleCustomerId`).
7. Wire onboarding UI to set the new credential + brand fields.

No changes to `core-monitor`, `claude-guard`, `action-executor`, `automation-runner`, or any sync route. The dispatch flows automatically.

### How to add a second credential mode for Meta (recipe)

For Plan B (HTTP MCP + OAuth) without changing the adapter:

1. Implement a new `CredentialProvider` at `src/lib/ad-platforms/credentials/meta-oauth.ts` that returns `{ kind: "oauth_refresh", accessToken, refreshToken, expiresAt }`.
2. Add OAuth flow + refresh token storage (mirror the existing Google OAuth flow).
3. Decide which provider answers `getCredentialProvider("meta")` — by user preference, by brand setting, or by attempting both with fallback. The registry can return a wrapper provider that picks per-brand.
4. The `metaAdapter` already handles both `Credential` kinds via `extractToken` — no adapter changes needed.

---

## Glossary

| Term | Meaning |
|---|---|
| **Platform** | An ads provider — Meta, Google Ads, TikTok, LinkedIn, etc. |
| **Adapter** | Concrete implementation of `AdPlatform` for one platform |
| **Credential** | The result of `CredentialProvider.getCredential()` — opaque to platform code |
| **System-user token** | Long-lived token issued by a Meta Business Portfolio bot user. ai-tasks's current auth model. |
| **OAuth refresh token** | Short-lived access + long-lived refresh token issued via Meta Business OAuth. Used by HTTP MCP. |
| **PlatformContext** | Per-call bundle: brand, credential, anything else the adapter needs |
| **Decision Journal** | Audit trail of every AI Guard verdict + execution. Will gain `platform` column. |
