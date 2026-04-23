import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

export function getModel() {
  const modelId = process.env.AI_MODEL || "gpt-4o-mini";

  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(modelId);
  }

  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(modelId);
  }

  throw new Error("No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.local");
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
