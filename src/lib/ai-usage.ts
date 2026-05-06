// Central recorder for every LLM call the app makes. Writes one row to
// `ai_usage_log` per call (success or failure). Recording must never throw
// — if the DB is wedged, the main feature still works; we just lose the
// observability data for that call. Failures are logged to the console.
import { db } from "@/db";
import { aiUsageLog } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { calculateCost } from "./ai-pricing";

export type AiUsageFeature = "jarvis" | "audit" | "health_check";
export type AiUsageProvider = "anthropic" | "openai";
export type AiUsageStatus = "success" | "error" | "rate_limited";

export type RecordAiUsageInput = {
  feature: AiUsageFeature;
  // Stable identifier for the call site — usually the route path
  // (e.g. "/api/ai/digest") or a fn name ("claude-guard.evaluateRecommendation").
  // The admin view groups by this column to show the per-route cost split.
  callSite: string;
  provider: AiUsageProvider;
  model: string;
  userId?: string | null;
  conversationId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number | null;
  status: AiUsageStatus;
  errorMessage?: string | null;
  requestId?: string | null;
};

export async function recordAiUsage(rec: RecordAiUsageInput): Promise<void> {
  try {
    const inputTokens = rec.inputTokens ?? 0;
    const outputTokens = rec.outputTokens ?? 0;
    const cacheCreation = rec.cacheCreationTokens ?? 0;
    const cacheRead = rec.cacheReadTokens ?? 0;

    const costUsd = calculateCost(rec.model, {
      input: inputTokens,
      output: outputTokens,
      cacheCreation,
      cacheRead,
    });

    await db.insert(aiUsageLog).values({
      id: uuid(),
      feature: rec.feature,
      callSite: rec.callSite,
      provider: rec.provider,
      model: rec.model,
      userId: rec.userId ?? null,
      conversationId: rec.conversationId ?? null,
      inputTokens,
      outputTokens,
      cacheCreationTokens: cacheCreation,
      cacheReadTokens: cacheRead,
      costUsd,
      latencyMs: rec.latencyMs ?? null,
      status: rec.status,
      errorMessage: rec.errorMessage?.slice(0, 1000) ?? null,
      requestId: rec.requestId ?? null,
    });
  } catch (err) {
    console.error("[ai-usage] failed to record:", err);
  }
}

// Vercel AI SDK v6 normalizes provider usage into a single shape. The
// fields are optional because some providers don't return cache stats.
type AiSdkUsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
};

export function fromAiSdkUsage(usage: AiSdkUsageLike | undefined | null): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
} {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    // Vercel AI SDK reports cache reads as cachedInputTokens. There's no
    // separate cache_creation field in the normalized shape — Anthropic
    // creation tokens collapse into inputTokens at the SDK layer, which
    // means we mildly under-attribute Anthropic cache-creation cost vs.
    // direct-SDK callers. Acceptable for Jarvis (cost is dominated by
    // OpenAI calls there).
    cacheReadTokens: usage?.cachedInputTokens ?? 0,
  };
}

// @anthropic-ai/sdk returns the raw Anthropic usage shape.
type AnthropicUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function fromAnthropicUsage(usage: AnthropicUsageLike | undefined | null): {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
} {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
  };
}
