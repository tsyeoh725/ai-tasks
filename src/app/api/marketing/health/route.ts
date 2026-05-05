import { db } from "@/db";
import { brands, telegramLinks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/session";
import { resolveMetaAccessToken } from "@/lib/marketing/meta-token";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";
import { getAnthropicKey } from "@/lib/app-config";

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

  // 1. Meta API — resolves the same way every brand sync does: per-brand
  //    metaAccessToken first, then the user's globalSettings.meta_access_token,
  //    finally the env fallback. Probing only the env token reported FAIL for
  //    users who configured their token in Settings instead.
  try {
    const ws = await resolveWorkspaceForUser(user.id);
    const accessibleBrand = await db.query.brands.findFirst({
      where: and(brandsAccessibleWhere(ws, user.id), eq(brands.isActive, true))!,
      columns: { id: true, userId: true },
    });
    // resolveMetaAccessToken treats metaAccessToken as optional — the column
    // doesn't exist in the schema yet (reserved for per-brand overrides) so
    // we just pass the brand's userId and let the resolver fall through to
    // globalSettings + env.
    const tokenSource = accessibleBrand
      ? { userId: accessibleBrand.userId, metaAccessToken: null }
      : { userId: user.id, metaAccessToken: null };
    const token = await resolveMetaAccessToken(tokenSource);

    if (!token) {
      results.meta = {
        ok: false,
        message: "No Meta access token — set one under Settings → Meta Ads",
      };
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

  // 2. Claude API — tiny probe. Resolve through app_config the same way
  //    AI Guard does (Settings → AI rotation lives there); env var is just
  //    the last-resort fallback.
  try {
    const key = await getAnthropicKey();
    if (!key) {
      results.claude = {
        ok: false,
        message: "No Anthropic API key — set one under Settings → AI",
      };
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

  // 3. Telegram — primary check is "is the bot token valid and reachable?".
  //    Whether *this* user has a personal chat linked is reported as a hint
  //    in the message, not as a failure: the bot can still send / receive
  //    updates without per-user linking, and notifications are only blocked
  //    for the unlinked user, not the system as a whole.
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      results.telegram = { ok: false, message: "TELEGRAM_BOT_TOKEN not set" };
    } else {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = (await res.json()) as {
        ok?: boolean;
        result?: { username?: string };
        description?: string;
      };
      if (data.ok) {
        const link = await db.query.telegramLinks.findFirst({
          where: eq(telegramLinks.userId, user.id),
        });
        const linkHint = link ? "your chat is linked" : "your chat is not linked";
        results.telegram = {
          ok: true,
          message: `Bot @${data.result?.username ?? "?"} reachable — ${linkHint}`,
        };
      } else {
        results.telegram = { ok: false, message: data.description || "Invalid bot token" };
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
