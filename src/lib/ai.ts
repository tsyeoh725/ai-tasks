import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { getAiModel, getAnthropicKey, getOpenAIKey } from "./app-config";

export async function getModel() {
  const [anthropicKey, openaiKey, configuredModel] = await Promise.all([
    getAnthropicKey(),
    getOpenAIKey(),
    getAiModel(),
  ]);

  if (anthropicKey) {
    const modelId = configuredModel || "claude-sonnet-4-6";
    const anthropic = createAnthropic({ apiKey: anthropicKey });
    return anthropic(modelId);
  }

  if (openaiKey) {
    const modelId = configuredModel || "gpt-4o-mini";
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(modelId);
  }

  throw new Error(
    "No AI API key configured. Add an OpenAI or Anthropic key under Settings → AI, or set OPENAI_API_KEY / ANTHROPIC_API_KEY in the env.",
  );
}

export async function isAiConfigured(): Promise<boolean> {
  const [anthropicKey, openaiKey] = await Promise.all([getAnthropicKey(), getOpenAIKey()]);
  return !!(anthropicKey || openaiKey);
}

export async function streamAiResponse(systemPrompt: string, userMessage: string) {
  const model = await getModel();

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return result;
}

export async function generateAiResponse(systemPrompt: string, userMessage: string): Promise<string> {
  const model = await getModel();

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  return text;
}
