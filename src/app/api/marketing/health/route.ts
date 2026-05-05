import { db } from "@/db";
import { telegramLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/session";

// POST /api/marketing/health — connectivity check for Meta / Claude / Telegram / DB.
// Returns a uniform shape per service: { ok: boolean, message: string } so the
// UI can render PASS/FAIL consistently.
type ServiceStatus = { ok: boolean; message: string };
type HealthResults = {
  meta: ServiceStatus;
  claude: ServiceStatus;
  telegram: ServiceStatus;
  database: ServiceStatus;
};

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const results: HealthResults = {
    meta: { ok: false, message: "" },
    claude: { ok: false, message: "" },
    telegram: { ok: false, message: "" },
    database: { ok: false, message: "" },
  };

  // 1. Meta API — uses the user's META_ACCESS_TOKEN env (per-brand tokens live in
  // an undocumented column and aren't checkable here without a specific brand).
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
      results.meta = { ok: false, message: "META_ACCESS_TOKEN not set" };
    } else {
      const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
      if (res.ok) {
        const data = (await res.json()) as { name?: string; id?: string };
        results.meta = { ok: true, message: `Connected as ${data.name ?? data.id}` };
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
        results.meta = { ok: false, message: msg };
      }
    }
  } catch (e) {
    results.meta = { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }

  // 2. Claude API — tiny probe.
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      results.claude = { ok: false, message: "ANTHROPIC_API_KEY not set" };
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });
      if (res.ok) {
        results.claude = { ok: true, message: "Connected" };
      } else if (res.status === 429) {
        // Rate-limited but the key is valid — count it as reachable.
        results.claude = { ok: true, message: "Rate-limited but reachable" };
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
        results.claude = { ok: false, message: msg };
      }
    }
  } catch (e) {
    results.claude = { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }

  // 3. Telegram — user-scoped. Check if this user has a linked chat AND the bot token works.
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      results.telegram = { ok: false, message: "TELEGRAM_BOT_TOKEN not set" };
    } else {
      const link = await db.query.telegramLinks.findFirst({
        where: eq(telegramLinks.userId, user.id),
      });
      if (!link) {
        results.telegram = { ok: false, message: "User has no linked Telegram chat" };
      } else {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = (await res.json()) as {
          ok?: boolean;
          result?: { username?: string };
          description?: string;
        };
        if (data.ok) {
          results.telegram = {
            ok: true,
            message: `Linked to @${data.result?.username ?? "bot"}`,
          };
        } else {
          results.telegram = { ok: false, message: data.description || "Invalid bot token" };
        }
      }
    }
  } catch (e) {
    results.telegram = { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }

  // 4. Database — quick ping using the same drizzle client the rest of the
  // app uses so a failed driver / migration surfaces here.
  try {
    const start = Date.now();
    await db.query.users.findFirst({ columns: { id: true } });
    const ms = Date.now() - start;
    results.database = { ok: true, message: `SQLite reachable (${ms}ms)` };
  } catch (e) {
    results.database = { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }

  return NextResponse.json(results);
}
