// ─── AI rate limiting (SL-9) ─────────────────────────────────────────────────
//
// `aiUsageLog` records every Jarvis call but nothing throttles. Combined with
// a forged Telegram update (CR-02) or a runaway model loop, single sessions
// could spend tens of dollars in a minute. The "5 step budget" caps tool
// chains per turn, not turns per second.
//
// This helper enforces a per-user-per-minute and per-user-per-day cap. Caps
// are read from env so they can be tuned without a redeploy.
//
//   AI_PER_USER_PER_MIN  default 20
//   AI_PER_USER_PER_DAY  default 500
//
// Cap exceeded → throws. Callers (chatWithJarvis, /api/ai/command) should
// catch and return a friendly "slow down / daily limit hit" message.

import { db } from "@/db";
import { aiUsageLog } from "@/db/schema";
import { and, eq, gte, count } from "drizzle-orm";

const DEFAULT_PER_MIN = 20;
const DEFAULT_PER_DAY = 500;

export class AiRateLimitError extends Error {
  scope: "minute" | "day";
  cap: number;
  constructor(scope: "minute" | "day", cap: number) {
    super(
      scope === "minute"
        ? `AI rate limit: ${cap} calls per minute. Slow down — give the previous turn a moment to complete.`
        : `AI daily limit: ${cap} calls per day. Wait for the daily reset or contact an admin to raise the cap.`,
    );
    this.scope = scope;
    this.cap = cap;
    this.name = "AiRateLimitError";
  }
}

function getCap(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Throws AiRateLimitError if the user has exceeded their per-minute or per-day
 * cap. Should be called BEFORE the streamText call so we don't burn tokens.
 *
 * Single-user dev / single-tenant: caps are per-user. Forged callers can't
 * bypass because aiUsageLog records by userId from the closure.
 */
export async function enforceAiRateLimit(userId: string): Promise<void> {
  const perMinCap = getCap("AI_PER_USER_PER_MIN", DEFAULT_PER_MIN);
  const perDayCap = getCap("AI_PER_USER_PER_DAY", DEFAULT_PER_DAY);

  const now = Date.now();
  const minAgo = new Date(now - 60_000);
  const dayAgo = new Date(now - 86_400_000);

  // One round-trip via two parallel COUNTs. SQLite handles this in ms with
  // the ai_usage_log_user_created_idx index from migration 0009.
  const [minCountRow, dayCountRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, minAgo))),
    db
      .select({ n: count() })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, dayAgo))),
  ]);

  const lastMin = minCountRow[0]?.n ?? 0;
  const lastDay = dayCountRow[0]?.n ?? 0;

  if (lastMin >= perMinCap) throw new AiRateLimitError("minute", perMinCap);
  if (lastDay >= perDayCap) throw new AiRateLimitError("day", perDayCap);
}
