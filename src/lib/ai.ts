import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export function getModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    const modelId = process.env.AI_MODEL || "claude-sonnet-4-6";
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(modelId);
  }

  if (process.env.OPENAI_API_KEY) {
    const modelId = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(modelId);
  }

  throw new Error("No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local");
}

export function isAiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

export async function streamAiResponse(systemPrompt: string, userMessage: string) {
  const model = getModel();

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return result;
}

export async function generateAiResponse(systemPrompt: string, userMessage: string): Promise<string> {
  const model = getModel();

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
