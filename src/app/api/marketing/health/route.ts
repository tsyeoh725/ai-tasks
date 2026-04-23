import { db } from "@/db";
import { telegramLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/session";

// POST /api/marketing/health — connectivity check for Meta / Claude / Telegram.
// Supabase is no longer part of the stack, so it is omitted.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const results: {
    meta: "ok" | "error" | "not_configured";
    metaMessage?: string;
    claude: "ok" | "error" | "not_configured";
    claudeMessage?: string;
    telegram: "ok" | "error" | "not_linked" | "not_configured";
    telegramMessage?: string;
  } = {
    meta: "not_configured",
    claude: "not_configured",
    telegram: "not_linked",
  };

  // 1. Meta API — uses the user's META_ACCESS_TOKEN env (per-brand tokens live in
  // an undocumented column and aren't checkable here without a specific brand).
  try {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
      results.meta = "not_configured";
      results.metaMessage = "META_ACCESS_TOKEN not set";
    } else {
      const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
      if (res.ok) {
        const data = (await res.json()) as { name?: string; id?: string };
        results.meta = "ok";
        results.metaMessage = `Connected as ${data.name ?? data.id}`;
      } else {
        const err = await res.json().catch(() => ({}));
        results.meta = "error";
        results.metaMessage = (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
      }
    }
  } catch (e) {
    results.meta = "error";
    results.metaMessage = e instanceof Error ? e.message : "Failed";
  }

  // 2. Claude API — tiny probe.
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      results.claude = "not_configured";
      results.claudeMessage = "ANTHROPIC_API_KEY not set";
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
        results.claude = "ok";
        results.claudeMessage = "Connected";
      } else if (res.status === 429) {
        // Rate-limited but key is valid
        results.claude = "ok";
        results.claudeMessage = "Rate-limited but reachable";
      } else {
        const err = await res.json().catch(() => ({}));
        results.claude = "error";
        results.claudeMessage = (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
      }
    }
  } catch (e) {
    results.claude = "error";
    results.claudeMessage = e instanceof Error ? e.message : "Failed";
  }

  // 3. Telegram — user-scoped. Check if this user has a linked chat AND the bot token works.
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      results.telegram = "not_configured";
      results.telegramMessage = "TELEGRAM_BOT_TOKEN not set";
    } else {
      const link = await db.query.telegramLinks.findFirst({
        where: eq(telegramLinks.userId, user.id),
      });
      if (!link) {
        results.telegram = "not_linked";
        results.telegramMessage = "User has no linked Telegram chat";
      } else {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = (await res.json()) as { ok?: boolean; result?: { username?: string }; description?: string };
        if (data.ok) {
          results.telegram = "ok";
          results.telegramMessage = `Linked to @${data.result?.username ?? "bot"}`;
        } else {
          results.telegram = "error";
          results.telegramMessage = data.description || "Invalid bot token";
        }
      }
    }
  } catch (e) {
    results.telegram = "error";
    results.telegramMessage = e instanceof Error ? e.message : "Failed";
  }

  return NextResponse.json(results);
}
