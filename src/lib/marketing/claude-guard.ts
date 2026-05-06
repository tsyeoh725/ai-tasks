// AI Guard — takes a Recommendation and returns a structured verdict.
// Ported from jarvis/src/lib/services/claude-client.ts. Uses @anthropic-ai/sdk.
import Anthropic from "@anthropic-ai/sdk";
import { getAuditAnthropicKey } from "@/lib/app-config";
import { db } from "@/db";
import { globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { fromAnthropicUsage, recordAiUsage, type AiUsageStatus } from "@/lib/ai-usage";

// --- Shared types (mirrored from Jarvis) ---

export interface BrandThresholds {
  cplMax: number | null;
  ctrMin: number | null;
  frequencyMax: number | null;
}

export interface BrandToggles {
  killEnabled: boolean;
  budgetEnabled: boolean;
  duplicateEnabled: boolean;
}

export interface BrandConfig {
  thresholds: BrandThresholds;
  toggles: BrandToggles;
  preferences: string[];
  insightsDateRange: number;
  costMetric?: { label: string; actionType: string };
  spendLimit?: {
    monthlyLimit: number | null;
    dailyLimit: number | null;
    alertThreshold: number;
    pauseOnLimit: boolean;
  };
}

export type RecommendationAction = "kill" | "pause" | "boost_budget" | "duplicate";

export interface RecentAction {
  action: string;
  verdict: string;
  actionTaken: boolean;
  createdAt: Date | string;
}

export interface AdMaturity {
  // Hours since the ad was first seen in our DB. This is a lower bound for
  // ad runtime — Meta might have started it earlier and we only synced it
  // now, but it's the closest signal we have without a separate Meta call.
  runtimeHours: number | null;
  impressions: number;
  clicks: number;
}

export interface Recommendation {
  brandId: string;
  brandName: string;
  adId: string | null;
  adSetId: string | null;
  adName: string;
  action: RecommendationAction;
  reason: string;
  kpiValues: {
    cpl: number | null;
    ctr: number | null;
    frequency: number | null;
    spend: number;
  };
  thresholds: BrandThresholds;
  // Data-sufficiency / cooldown signals the AI Guard prompt depends on.
  // Populated by core-monitor; the prompt's hard gates (runtime ≥ 24h,
  // impressions ≥ 100, 72h cooldown) cannot pass without them.
  maturity: AdMaturity;
  recentActions: RecentAction[];
}

export type VerdictType = "approved" | "rejected" | "pending";
export type RiskLevel = "low" | "medium" | "high";

export interface GuardVerdict {
  verdict: VerdictType;
  reasoning: string;
  confidence: number;
  riskLevel: RiskLevel;
}

export interface AgentMemoryEntry {
  memoryType: string;
  content: string;
  createdAt: Date | string;
}

// --- Client ---

// Cache the client per-API-key so a Settings rotation invalidates the old one
// instead of holding onto a stale handle for the lifetime of the process.
let cachedClient: { key: string; client: Anthropic } | null = null;

async function getClient(): Promise<Anthropic> {
  const apiKey = await getAuditAnthropicKey();
  if (!apiKey) {
    throw new Error(
      "Audit Anthropic API key not configured. Add one under Settings → AI (Audit), or set ANTHROPIC_API_KEY_AUDIT in the env.",
    );
  }
  if (cachedClient && cachedClient.key === apiKey) return cachedClient.client;
  const client = new Anthropic({ apiKey });
  cachedClient = { key: apiKey, client };
  return client;
}

function classifyAuditError(err: unknown): AiUsageStatus {
  if (err instanceof Anthropic.APIError && err.status === 429) return "rate_limited";
  const msg = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|429/i.test(msg)) return "rate_limited";
  return "error";
}

async function recordAuditCall(input: {
  callSite: string;
  model: string;
  userId?: string | null;
  startedAt: number;
  response?: { usage?: unknown; _request_id?: string | null } | null;
  error?: unknown;
}): Promise<void> {
  const status: AiUsageStatus = input.error ? classifyAuditError(input.error) : "success";
  const requestId =
    (input.response as { _request_id?: string | null } | null)?._request_id ?? null;
  const usage = (input.response as { usage?: unknown } | null)?.usage as
    | Parameters<typeof fromAnthropicUsage>[0]
    | undefined;
  await recordAiUsage({
    feature: "audit",
    callSite: input.callSite,
    provider: "anthropic",
    model: input.model,
    userId: input.userId ?? null,
    ...fromAnthropicUsage(usage),
    latencyMs: Date.now() - input.startedAt,
    status,
    errorMessage: input.error
      ? input.error instanceof Error
        ? input.error.message
        : String(input.error)
      : null,
    requestId,
  });
}

// Default guard model — overridable via env for easy rollbacks.
const GUARD_MODEL = process.env.JARVIS_GUARD_MODEL || "claude-haiku-4-5-20251001";
const SUMMARY_MODEL = process.env.JARVIS_SUMMARY_MODEL || "claude-sonnet-4-6";

const GUARD_TOOL = {
  name: "validate_recommendation" as const,
  description: "Validate an ad management recommendation and return a structured verdict",
  input_schema: {
    type: "object" as const,
    properties: {
      verdict: {
        type: "string",
        enum: ["approved", "rejected", "pending"],
        description:
          "approved = safe to auto-execute, rejected = do not execute, pending = needs human review",
      },
      reasoning: { type: "string", description: "Detailed reasoning for the verdict" },
      confidence: { type: "number", description: "Confidence score from 0.0 to 1.0" },
      risk_level: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Risk level of executing this recommendation",
      },
    },
    required: ["verdict", "reasoning", "confidence", "risk_level"],
  },
};

// Three editable prompt sections. The user can edit each one independently
// on /automation. They get concatenated (in this order) into the system
// message; brand-specific context (thresholds, toggles, memory) is appended
// to the user message at runtime, NOT spliced into the prompt — so the
// editable text stays static and readable.
export const DEFAULT_AUDIT_PROMPT = `You are Jarvis AI Guard — a quality assurance agent for automated Meta ad management.

Your job is to validate or reject recommendations made by the Core Monitor agent. You must evaluate whether each recommendation is logically sound, data-backed, and safe to execute.

## Evaluation Criteria
1. DATA SUFFICIENCY: If the ad has been running for less than 24 hours or has very low impressions (<100), reject or mark pending — insufficient data to make a decision.
2. LOGIC SOUNDNESS: Does the KPI data actually support the recommendation? Check that the numbers match the thresholds.
3. BRAND ALIGNMENT: Does this recommendation align with the brand's historical patterns and preferences from memory?

## Decision Rules
- If data is insufficient: verdict MUST be "rejected" with explanation
- If the action is high-risk: verdict MUST be "pending"
- If logic is sound and risk is low/medium with high confidence: verdict can be "approved"

Always use the validate_recommendation tool to return your verdict.`;

export const DEFAULT_CONFIDENCE_PROMPT = `## Confidence Rubric
Return a confidence value between 0.0 and 1.0 representing how sure you are the verdict is correct.

- 0.90–1.00 — KPI signal is unambiguous, the data window is large, and the recommendation matches a pattern the brand has approved before.
- 0.75–0.89 — Numbers clearly cross thresholds but the trend is recent or the sample is moderate. Reasonable approval candidate for low-risk actions.
- 0.60–0.74 — Signal exists but is borderline (close to threshold, small sample, conflicting KPIs). Prefer "pending".
- < 0.60 — Data is sparse, contradictory, or the brand's memory shows similar past calls were wrong. Use "pending" or "rejected".

Hard rule: if confidence < 0.7, verdict MUST be "pending" regardless of the other rules.`;

export const DEFAULT_HEALTH_PROMPT = `## Ads Health Risk Assessment
Classify the action's risk to the account before deciding the verdict:

- HIGH RISK: Killing the last active ad in a campaign; budget changes greater than 50%; duplicating into a brand-new audience without a winner reference; any action on a campaign currently spending >RM 500/day.
- MEDIUM RISK: Pausing an ad with moderate performance; duplicating to a partially-tested audience; budget changes between 20-50%.
- LOW RISK: Small budget adjustments (<20%); pausing an ad that has clearly underperformed for 3+ days; killing an ad with zero conversions over its full runtime.

A high-risk action must be downgraded to "pending" so a human reviews it, even if the KPI logic is sound.`;

export const PROMPT_KINDS = ["audit", "confidence", "health"] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];

const PROMPT_DEFAULTS: Record<PromptKind, string> = {
  audit: DEFAULT_AUDIT_PROMPT,
  confidence: DEFAULT_CONFIDENCE_PROMPT,
  health: DEFAULT_HEALTH_PROMPT,
};

const PROMPT_KEY: Record<PromptKind, string> = {
  audit: "guard_audit_prompt",
  confidence: "guard_confidence_prompt",
  health: "guard_health_prompt",
};

// Backward compat: the prior single-prompt key. If a user saved one under
// the old name, treat it as the audit prompt on first read.
const LEGACY_AUDIT_KEY = "guard_system_prompt";

async function loadPromptSection(userId: string, kind: PromptKind): Promise<string> {
  try {
    const row = await db.query.globalSettings.findFirst({
      where: and(eq(globalSettings.userId, userId), eq(globalSettings.key, PROMPT_KEY[kind])),
    });
    if (row) {
      const parsed = JSON.parse(row.value) as { template?: string } | string;
      const template = typeof parsed === "string" ? parsed : parsed?.template;
      if (template && template.trim().length > 0) return template;
    }
    if (kind === "audit") {
      const legacy = await db.query.globalSettings.findFirst({
        where: and(eq(globalSettings.userId, userId), eq(globalSettings.key, LEGACY_AUDIT_KEY)),
      });
      if (legacy) {
        const parsed = JSON.parse(legacy.value) as { template?: string } | string;
        const template = typeof parsed === "string" ? parsed : parsed?.template;
        // Strip any old {{...}} tokens — they were resolved at render time
        // before, but the new format has no placeholders. Leaving them in
        // would produce literal `{{brand_thresholds}}` in the system prompt.
        if (template && template.trim().length > 0) {
          return template.replace(/\{\{[a-z_]+\}\}/g, "").trim();
        }
      }
    }
    return PROMPT_DEFAULTS[kind];
  } catch {
    return PROMPT_DEFAULTS[kind];
  }
}

export async function loadAllPromptSections(
  userId: string,
): Promise<Record<PromptKind, string>> {
  const [audit, confidence, health] = await Promise.all([
    loadPromptSection(userId, "audit"),
    loadPromptSection(userId, "confidence"),
    loadPromptSection(userId, "health"),
  ]);
  return { audit, confidence, health };
}

export function getPromptDefault(kind: PromptKind): string {
  return PROMPT_DEFAULTS[kind];
}

export function getPromptKey(kind: PromptKind): string {
  return PROMPT_KEY[kind];
}

function formatBrandContext(
  brandConfig: BrandConfig,
  memoryEntries: AgentMemoryEntry[],
): string {
  const memoryContext =
    memoryEntries.length > 0
      ? memoryEntries
          .map((m) => {
            const ts = m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt);
            return `[${m.memoryType} - ${ts}]: ${m.content}`;
          })
          .join("\n")
      : "No prior memory for this brand.";

  return `## Brand Context (auto-injected)
- CPL Maximum Threshold: ${brandConfig.thresholds.cplMax ?? "Not set"}
- CTR Minimum Threshold: ${brandConfig.thresholds.ctrMin ?? "Not set"}
- Frequency Maximum Threshold: ${brandConfig.thresholds.frequencyMax ?? "Not set"}
- Automation Toggles: Kill=${brandConfig.toggles.killEnabled}, Budget=${brandConfig.toggles.budgetEnabled}, Duplicate=${brandConfig.toggles.duplicateEnabled}

## Brand Memory & Learning History (auto-injected)
${memoryContext}`;
}

async function buildGuardSystemPrompt(brandUserId: string): Promise<string> {
  const sections = await loadAllPromptSections(brandUserId);
  return [sections.audit, sections.confidence, sections.health]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/**
 * Evaluate an ad management recommendation via Claude with structured tool output.
 */
export async function evaluateRecommendation(
  recommendation: Recommendation,
  brandConfig: BrandConfig,
  memoryEntries: AgentMemoryEntry[],
  brandUserId: string,
): Promise<GuardVerdict> {
  const anthropic = await getClient();

  // Brand context (thresholds, toggles, memory) is appended to the user
  // message so the editable system prompt can stay placeholder-free.
  const brandContext = formatBrandContext(brandConfig, memoryEntries);

  const runtimeStr =
    recommendation.maturity.runtimeHours !== null
      ? recommendation.maturity.runtimeHours >= 48
        ? `${(recommendation.maturity.runtimeHours / 24).toFixed(1)} days (${recommendation.maturity.runtimeHours.toFixed(0)}h)`
        : `${recommendation.maturity.runtimeHours.toFixed(1)}h`
      : "Unknown";

  const recentActionsStr =
    recommendation.recentActions.length === 0
      ? "- none in the last 7 days"
      : recommendation.recentActions
          .map((a) => {
            const ts = a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt);
            const exec = a.actionTaken ? "executed" : "not executed";
            return `- ${ts} — ${a.action.toUpperCase()} → ${a.verdict} (${exec})`;
          })
          .join("\n");

  const userMessage = `Evaluate this ad management recommendation:

**Action:** ${recommendation.action.toUpperCase()}
**Ad:** ${recommendation.adName}
**Reason:** ${recommendation.reason}

**Current KPIs:**
- CPL: ${recommendation.kpiValues.cpl !== null ? `RM ${recommendation.kpiValues.cpl.toFixed(2)}` : "N/A (no leads)"}
- CTR: ${recommendation.kpiValues.ctr !== null ? `${recommendation.kpiValues.ctr.toFixed(2)}%` : "N/A"}
- Frequency: ${recommendation.kpiValues.frequency !== null ? recommendation.kpiValues.frequency.toFixed(2) : "N/A"}
- Total Spend: RM ${recommendation.kpiValues.spend.toFixed(2)}

**Ad Maturity (data sufficiency signals):**
- Runtime (since first synced): ${runtimeStr}
- Impressions: ${recommendation.maturity.impressions.toLocaleString()}
- Clicks: ${recommendation.maturity.clicks.toLocaleString()}

**Recent actions on this ad (last 7 days, newest first):**
${recentActionsStr}

${brandContext}

Validate this recommendation using the tool.`;

  const startedAt = Date.now();
  let response;
  try {
    response = await anthropic.messages.create({
      model: GUARD_MODEL,
      max_tokens: 1024,
      system: await buildGuardSystemPrompt(brandUserId),
      tools: [GUARD_TOOL],
      tool_choice: { type: "tool", name: "validate_recommendation" },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    await recordAuditCall({
      callSite: "claude-guard.evaluateRecommendation",
      model: GUARD_MODEL,
      userId: brandUserId,
      startedAt,
      error: err,
    });
    throw err;
  }
  await recordAuditCall({
    callSite: "claude-guard.evaluateRecommendation",
    model: GUARD_MODEL,
    userId: brandUserId,
    startedAt,
    response,
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return {
      verdict: "pending",
      reasoning: "AI Guard failed to return a structured verdict. Defaulting to pending for human review.",
      confidence: 0,
      riskLevel: "high",
    };
  }

  const input = toolUse.input as Record<string, unknown>;
  return {
    verdict: input.verdict as VerdictType,
    reasoning: input.reasoning as string,
    confidence: input.confidence as number,
    riskLevel: input.risk_level as RiskLevel,
  };
}

/**
 * Generate a weekly performance summary for a brand from its recent decisions.
 */
export async function generateWeeklySummary(
  brandName: string,
  decisions: Array<{
    recommendation: string;
    guardVerdict: string;
    actionTaken: boolean;
    reason: string;
    createdAt: Date | string;
  }>,
): Promise<string> {
  const anthropic = await getClient();

  const decisionsText = decisions
    .map((d) => {
      const ts = d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt);
      return `- [${ts}] ${d.recommendation.toUpperCase()}: ${d.reason} -> Guard: ${d.guardVerdict}, Executed: ${d.actionTaken}`;
    })
    .join("\n");

  const startedAt = Date.now();
  let response;
  try {
    response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Generate a concise weekly performance summary for the brand "${brandName}".
Analyze these decisions from the past 7 days and identify patterns, trends, and recommendations for future optimization.

Decisions:
${decisionsText}

Format the summary as:
1. Overview (2-3 sentences)
2. Key Patterns Observed
3. Recommendations for Next Week
4. Any Concerns

Keep it actionable and under 500 words.`,
      },
    ],
    });
  } catch (err) {
    await recordAuditCall({
      callSite: "claude-guard.generateWeeklySummary",
      model: SUMMARY_MODEL,
      startedAt,
      error: err,
    });
    throw err;
  }
  await recordAuditCall({
    callSite: "claude-guard.generateWeeklySummary",
    model: SUMMARY_MODEL,
    startedAt,
    response,
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "Failed to generate summary.";
}
