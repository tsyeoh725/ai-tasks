// Per-model pricing (USD per 1M tokens). Used to compute cost_usd at the
// moment a usage row is inserted, so historical rows stay accurate even if
// the provider changes their list price later. Update this table when you
// rotate to a newer model — old rows are not back-corrected.
//
// Anthropic figures from console.anthropic.com/pricing (Jan 2026).
// OpenAI figures from openai.com/api/pricing (Jan 2026).
// Cache numbers: Anthropic distinguishes cache_creation vs cache_read;
// OpenAI exposes a single "cached input" rate (cache_read).

export type Provider = "anthropic" | "openai";

export type PriceRow = {
  provider: Provider;
  // USD per 1M tokens.
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
};

// Match the longest prefix in this list. New entries should be added with
// the most-specific id first (e.g. "claude-opus-4-7-1m" before "claude-opus-4-7").
const PRICING: Array<[string, PriceRow]> = [
  // ---- Anthropic ----
  ["claude-opus-4-7", { provider: "anthropic", input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 }],
  ["claude-opus-4-6", { provider: "anthropic", input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 }],
  ["claude-opus-4-5", { provider: "anthropic", input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 }],
  ["claude-opus", { provider: "anthropic", input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 }],
  ["claude-sonnet-4-6", { provider: "anthropic", input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 }],
  ["claude-sonnet-4-5", { provider: "anthropic", input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 }],
  ["claude-sonnet", { provider: "anthropic", input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 }],
  ["claude-haiku-4-5", { provider: "anthropic", input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 }],
  ["claude-haiku", { provider: "anthropic", input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 }],
  // ---- OpenAI ----
  ["gpt-4o-mini", { provider: "openai", input: 0.15, output: 0.6, cacheCreation: 0, cacheRead: 0.075 }],
  ["gpt-4o", { provider: "openai", input: 2.5, output: 10, cacheCreation: 0, cacheRead: 1.25 }],
  ["gpt-4-turbo", { provider: "openai", input: 10, output: 30, cacheCreation: 0, cacheRead: 0 }],
  ["gpt-4", { provider: "openai", input: 30, output: 60, cacheCreation: 0, cacheRead: 0 }],
  ["gpt-5", { provider: "openai", input: 1.25, output: 10, cacheCreation: 0, cacheRead: 0.125 }],
  ["o1-mini", { provider: "openai", input: 1.1, output: 4.4, cacheCreation: 0, cacheRead: 0.55 }],
  ["o1", { provider: "openai", input: 15, output: 60, cacheCreation: 0, cacheRead: 7.5 }],
];

export function getPricing(model: string): PriceRow | null {
  const id = model.toLowerCase();
  for (const [prefix, row] of PRICING) {
    if (id.startsWith(prefix)) return row;
  }
  return null;
}

export function calculateCost(
  model: string,
  tokens: { input: number; output: number; cacheCreation?: number; cacheRead?: number },
): number {
  const p = getPricing(model);
  if (!p) return 0;
  const input = tokens.input * p.input;
  const output = tokens.output * p.output;
  const cw = (tokens.cacheCreation ?? 0) * p.cacheCreation;
  const cr = (tokens.cacheRead ?? 0) * p.cacheRead;
  return (input + output + cw + cr) / 1_000_000;
}
