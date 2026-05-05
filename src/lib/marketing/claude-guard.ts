// AI Guard — takes a Recommendation and returns a structured verdict.
// Ported from jarvis/src/lib/services/claude-client.ts. Uses @anthropic-ai/sdk.
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicKey } from "@/lib/app-config";
import { db } from "@/db";
import { globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

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
  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not configured. Add one under Settings → AI, or set ANTHROPIC_API_KEY in the env.",
    );
  }
  if (cachedClient && cachedClient.key === apiKey) return cachedClient.client;
  const client = new Anthropic({ apiKey });
  cachedClient = { key: apiKey, client };
  return client;
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

// Default system prompt template. Editable per-user via the /automation
// page (stored in globalSettings under key=guard_system_prompt). The
// {{...}} placeholders are substituted at render time so the user never
// has to re-paste the dynamic brand context when tweaking instructions.
export const DEFAULT_GUARD_SYSTEM_PROMPT = `You are Jarvis AI Guard — a quality assurance agent for automated Meta ad management.

Your job is to validate or reject recommendations made by the Core Monitor agent. You must evaluate whether each recommendation is logically sound, data-backed, and safe to execute.

## Brand Configuration
{{brand_thresholds}}
{{toggles}}

## Brand Memory & Learning History
{{brand_memory}}

## Evaluation Criteria
1. DATA SUFFICIENCY: If the ad has been running for less than 24 hours or has very low impressions (<100), reject or mark pending — insufficient data to make a decision.
2. LOGIC SOUNDNESS: Does the KPI data actually support the recommendation? Check that the numbers match the thresholds.
3. RISK ASSESSMENT:
   - HIGH RISK: Killing the last active ad in a campaign, large budget changes (>50% increase)
   - MEDIUM RISK: Pausing ads with moderate performance, duplicating to untested audiences
   - LOW RISK: Small budget adjustments, pausing clearly underperforming ads
4. BRAND ALIGNMENT: Does this recommendation align with the brand's historical patterns and preferences from memory?

## Decision Rules
- If confidence < 0.7: verdict MUST be "pending"
- If the action is high-risk: verdict MUST be "pending"
- If data is insufficient: verdict MUST be "rejected" with explanation
- If logic is sound and risk is low/medium with high confidence: verdict can be "approved"

Always use the validate_recommendation tool to return your verdict.`;

export const GUARD_PROMPT_VARIABLES = [
  { name: "{{brand_thresholds}}", description: "CPL/CTR/frequency thresholds set on the brand" },
  { name: "{{toggles}}", description: "Which automation actions the brand has enabled" },
  { name: "{{brand_memory}}", description: "Recent memory entries (operator remarks, weekly summaries)" },
] as const;

async function loadGuardPromptTemplate(brandUserId: string): Promise<string> {
  // The prompt is per-user (the brand's owner), not global. Falls back to
  // the default when no override exists or the saved value is empty.
  try {
    const row = await db.query.globalSettings.findFirst({
      where: and(eq(globalSettings.userId, brandUserId), eq(globalSettings.key, "guard_system_prompt")),
    });
    if (!row) return DEFAULT_GUARD_SYSTEM_PROMPT;
    const parsed = JSON.parse(row.value) as { template?: string } | string;
    const template = typeof parsed === "string" ? parsed : parsed?.template;
    return template && template.trim().length > 0 ? template : DEFAULT_GUARD_SYSTEM_PROMPT;
  } catch {
    return DEFAULT_GUARD_SYSTEM_PROMPT;
  }
}

function renderGuardPrompt(
  template: string,
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

  const thresholds = [
    `- CPL Maximum Threshold: ${brandConfig.thresholds.cplMax ?? "Not set"}`,
    `- CTR Minimum Threshold: ${brandConfig.thresholds.ctrMin ?? "Not set"}`,
    `- Frequency Maximum Threshold: ${brandConfig.thresholds.frequencyMax ?? "Not set"}`,
  ].join("\n");

  const toggles = `- Automation Toggles: Kill=${brandConfig.toggles.killEnabled}, Budget=${brandConfig.toggles.budgetEnabled}, Duplicate=${brandConfig.toggles.duplicateEnabled}`;

  return template
    .replaceAll("{{brand_thresholds}}", thresholds)
    .replaceAll("{{toggles}}", toggles)
    .replaceAll("{{brand_memory}}", memoryContext);
}

async function buildGuardSystemPrompt(
  brandUserId: string,
  brandConfig: BrandConfig,
  memoryEntries: AgentMemoryEntry[],
): Promise<string> {
  const template = await loadGuardPromptTemplate(brandUserId);
  return renderGuardPrompt(template, brandConfig, memoryEntries);
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

  const userMessage = `Evaluate this ad management recommendation:

**Action:** ${recommendation.action.toUpperCase()}
**Ad:** ${recommendation.adName}
**Reason:** ${recommendation.reason}

**Current KPIs:**
- CPL: ${recommendation.kpiValues.cpl !== null ? `RM ${recommendation.kpiValues.cpl.toFixed(2)}` : "N/A (no leads)"}
- CTR: ${recommendation.kpiValues.ctr !== null ? `${recommendation.kpiValues.ctr.toFixed(2)}%` : "N/A"}
- Frequency: ${recommendation.kpiValues.frequency !== null ? recommendation.kpiValues.frequency.toFixed(2) : "N/A"}
- Total Spend: RM ${recommendation.kpiValues.spend.toFixed(2)}

**Thresholds:**
- CPL Max: ${recommendation.thresholds.cplMax !== null ? `RM ${recommendation.thresholds.cplMax}` : "Not set"}
- CTR Min: ${recommendation.thresholds.ctrMin !== null ? `${recommendation.thresholds.ctrMin}%` : "Not set"}
- Frequency Max: ${recommendation.thresholds.frequencyMax ?? "Not set"}

Validate this recommendation using the tool.`;

  const response = await anthropic.messages.create({
    model: GUARD_MODEL,
    max_tokens: 1024,
    system: await buildGuardSystemPrompt(brandUserId, brandConfig, memoryEntries),
    tools: [GUARD_TOOL],
    tool_choice: { type: "tool", name: "validate_recommendation" },
    messages: [{ role: "user", content: userMessage }],
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

  const response = await anthropic.messages.create({
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

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "Failed to generate summary.";
}
