// Jarvis-side AI helpers. Always uses the OpenAI client + Jarvis-specific
// API key. The marketing audit pipeline talks to Anthropic directly via
// `src/lib/marketing/claude-guard.ts` and a separate audit key — keep
// these two paths separate so spend attribution stays clean.
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type LanguageModel } from "ai";
import { getAiModel, getJarvisOpenAIKey } from "./app-config";
import { fromAiSdkUsage, recordAiUsage, type AiUsageStatus } from "./ai-usage";

// Default OpenAI model for Jarvis. The Settings UI can override this; pass
// any OpenAI-compatible id (gpt-4o-mini, gpt-4o, gpt-5, ...).
const DEFAULT_JARVIS_MODEL = "gpt-4o-mini";

export async function getJarvisModel(): Promise<{ model: LanguageModel; modelId: string }> {
  const [openaiKey, configuredModel] = await Promise.all([getJarvisOpenAIKey(), getAiModel()]);

  if (!openaiKey) {
    throw new Error(
      "Jarvis OpenAI key not configured. Add one under Settings → AI (Jarvis), or set OPENAI_API_KEY_JARVIS in the env.",
    );
  }

  // Configured model is shared across the app; if it looks like an
  // Anthropic id (legacy install) fall back to the OpenAI default rather
  // than POSTing a Claude model name to api.openai.com — that was the bug
  // that produced yesterday's `model: 'gpt-4o-mini'` 404s in reverse.
  const modelId =
    configuredModel && !configuredModel.toLowerCase().startsWith("claude")
      ? configuredModel
      : DEFAULT_JARVIS_MODEL;

  const openai = createOpenAI({ apiKey: openaiKey });
  return { model: openai(modelId), modelId };
}

// Back-compat: some routes still call getModel() and unwrap the model object.
export async function getModel(): Promise<LanguageModel> {
  const { model } = await getJarvisModel();
  return model;
}

export async function isAiConfigured(): Promise<boolean> {
  const k = await getJarvisOpenAIKey();
  return !!k;
}

// Common options for the streaming helpers. `callSite` is required so the
// admin usage view can attribute spend per route.
export type JarvisCallOptions = {
  callSite: string;
  userId?: string | null;
  conversationId?: string | null;
  onError?: (error: unknown) => void;
};

// In AI SDK v6 streamText errors are NOT thrown when iterating textStream —
// they are routed to onError. Without a handler, a bad key / deprecated model /
// network failure produces a silently-empty stream and the caller sees nothing.
// Callers pass `onError` so they can surface the failure (e.g. into the HTTP
// response) instead of returning an empty 200.
export async function streamAiResponse(
  systemPrompt: string,
  userMessage: string,
  options: JarvisCallOptions,
) {
  const { model, modelId } = await getJarvisModel();
  const startedAt = Date.now();
  let recorded = false;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    onFinish: ({ usage, finishReason }) => {
      if (recorded) return;
      recorded = true;
      const status: AiUsageStatus = finishReason === "error" ? "error" : "success";
      void recordAiUsage({
        feature: "jarvis",
        callSite: options.callSite,
        provider: "openai",
        model: modelId,
        userId: options.userId ?? null,
        conversationId: options.conversationId ?? null,
        ...fromAiSdkUsage(usage),
        latencyMs: Date.now() - startedAt,
        status,
      });
    },
    onError: ({ error }) => {
      console.error("[ai] streamText error:", error);
      options.onError?.(error);
      if (recorded) return;
      recorded = true;
      void recordAiUsage({
        feature: "jarvis",
        callSite: options.callSite,
        provider: "openai",
        model: modelId,
        userId: options.userId ?? null,
        conversationId: options.conversationId ?? null,
        latencyMs: Date.now() - startedAt,
        status: classifyError(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return result;
}

export async function generateAiResponse(
  systemPrompt: string,
  userMessage: string,
  options: JarvisCallOptions,
): Promise<string> {
  const { model, modelId } = await getJarvisModel();
  const startedAt = Date.now();
  let captured: unknown = null;
  let recorded = false;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    onFinish: ({ usage, finishReason }) => {
      if (recorded) return;
      recorded = true;
      const status: AiUsageStatus = finishReason === "error" ? "error" : "success";
      void recordAiUsage({
        feature: "jarvis",
        callSite: options.callSite,
        provider: "openai",
        model: modelId,
        userId: options.userId ?? null,
        ...fromAiSdkUsage(usage),
        latencyMs: Date.now() - startedAt,
        status,
      });
    },
    onError: ({ error }) => {
      captured = error;
      console.error("[ai] streamText error:", error);
      if (recorded) return;
      recorded = true;
      void recordAiUsage({
        feature: "jarvis",
        callSite: options.callSite,
        provider: "openai",
        model: modelId,
        userId: options.userId ?? null,
        latencyMs: Date.now() - startedAt,
        status: classifyError(error),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    },
  });

  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  if (!text && captured) {
    throw captured instanceof Error ? captured : new Error(String(captured));
  }
  return text;
}

function classifyError(err: unknown): AiUsageStatus {
  const msg = err instanceof Error ? err.message : String(err);
  if (/rate.?limit|429/i.test(msg)) return "rate_limited";
  return "error";
}
