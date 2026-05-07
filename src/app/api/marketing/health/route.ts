import { db } from "@/db";
import { brands, telegramLinks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/session";
import { resolveMetaAccessToken } from "@/lib/ad-platforms/credentials/meta-system-user";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";
import { getAuditAnthropicKey, getJarvisOpenAIKey } from "@/lib/app-config";
import { recordAiUsage } from "@/lib/ai-usage";

// POST /api/marketing/health — connectivity check for every external API the
// app talks to. Returns one ServiceStatus per probe so the UI can render
// PASS/FAIL consistently. Used to be marketing-only (Meta + Claude); now
// covers Jarvis (OpenAI) and Audit (Anthropic) separately so a misconfigured
// key on one side surfaces without firing real Jarvis/Audit traffic to find
// out at runtime.
type ServiceStatus = { ok: boolean; message: string; latencyMs?: number };
type HealthResults = {
  meta: ServiceStatus;
  jarvis_openai: ServiceStatus;
  audit_anthropic: ServiceStatus;
  telegram: ServiceStatus;
  database: ServiceStatus;
};

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const results: HealthResults = {
    meta: { ok: false, message: "" },
    jarvis_openai: { ok: false, message: "" },
    audit_anthropic: { ok: false, message: "" },
    telegram: { ok: false, message: "" },
    database: { ok: false, message: "" },
  };

  // 1. Meta API — resolves the same way every brand sync does: per-brand
  //    metaAccessToken first, then the user's globalSettings.meta_access_token,
  //    finally the env fallback. Probing only the env token reported FAIL for
  //    users who configured their token in Settings instead.
  {
    const startedAt = Date.now();
    try {
      const ws = await resolveWorkspaceForUser(user.id);
      const accessibleBrand = await db.query.brands.findFirst({
        where: and(brandsAccessibleWhere(ws, user.id), eq(brands.isActive, true))!,
        columns: { id: true, userId: true },
      });
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
        const latencyMs = Date.now() - startedAt;
        if (res.ok) {
          const data = (await res.json()) as { name?: string; id?: string };
          // F-76 (audit-random-bug-fix): the casing of `data.name` is whatever
          // is set on the Meta side (e.g. "Openclaw" vs "OpenClaw"). We pass
          // it through verbatim so the operator sees exactly what Meta has —
          // discrepancies they spot here usually mean someone updated their
          // FB display name. Don't normalize.
          results.meta = { ok: true, message: `Connected as ${data.name ?? data.id}`, latencyMs };
        } else {
          const err = await res.json().catch(() => ({}));
          const msg =
            (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
          results.meta = { ok: false, message: msg, latencyMs };
        }
      }
    } catch (e) {
      results.meta = { ok: false, message: e instanceof Error ? e.message : "Failed", latencyMs: Date.now() - startedAt };
    }
  }

  // 2. Jarvis (OpenAI) — uses the OpenAI key dedicated to Jarvis. Probes
  //    /v1/models (no token spend) so re-running this page is free.
  {
    const startedAt = Date.now();
    try {
      const key = await getJarvisOpenAIKey();
      if (!key) {
        results.jarvis_openai = {
          ok: false,
          message: "No Jarvis OpenAI key — set one under Settings → AI",
        };
      } else {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const latencyMs = Date.now() - startedAt;
        if (res.ok) {
          results.jarvis_openai = { ok: true, message: "Connected", latencyMs };
        } else if (res.status === 429) {
          results.jarvis_openai = { ok: true, message: "Rate-limited but reachable", latencyMs };
        } else {
          const err = await res.json().catch(() => ({}));
          const msg =
            (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
          results.jarvis_openai = { ok: false, message: msg, latencyMs };
        }
        await recordAiUsage({
          feature: "health_check",
          callSite: "/api/marketing/health (jarvis_openai)",
          provider: "openai",
          model: "(probe)",
          userId: user.id,
          latencyMs,
          status: results.jarvis_openai.ok ? "success" : "error",
          errorMessage: results.jarvis_openai.ok ? null : results.jarvis_openai.message,
        });
      }
    } catch (e) {
      results.jarvis_openai = {
        ok: false,
        message: e instanceof Error ? e.message : "Failed",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // 3. Audit (Anthropic) — uses the Anthropic key dedicated to the marketing
  //    audit pipeline. Probes /v1/messages with max_tokens:1 because Anthropic
  //    doesn't have a free models endpoint. Costs ~$0 per check.
  {
    const startedAt = Date.now();
    try {
      const key = await getAuditAnthropicKey();
      if (!key) {
        results.audit_anthropic = {
          ok: false,
          message: "No Audit Anthropic key — set one under Settings → AI",
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
            max_tokens: 1,
            messages: [{ role: "user", content: "Hi" }],
          }),
        });
        const latencyMs = Date.now() - startedAt;
        let usage: { input_tokens?: number; output_tokens?: number } | null = null;
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            usage?: { input_tokens?: number; output_tokens?: number };
          };
          usage = body.usage ?? null;
          results.audit_anthropic = { ok: true, message: "Connected", latencyMs };
        } else if (res.status === 429) {
          results.audit_anthropic = { ok: true, message: "Rate-limited but reachable", latencyMs };
        } else {
          const err = await res.json().catch(() => ({}));
          const msg =
            (err as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`;
          results.audit_anthropic = { ok: false, message: msg, latencyMs };
        }
        await recordAiUsage({
          feature: "health_check",
          callSite: "/api/marketing/health (audit_anthropic)",
          provider: "anthropic",
          model: "claude-haiku-4-5-20251001",
          userId: user.id,
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          latencyMs,
          status: results.audit_anthropic.ok ? "success" : "error",
          errorMessage: results.audit_anthropic.ok ? null : results.audit_anthropic.message,
        });
      }
    } catch (e) {
      results.audit_anthropic = {
        ok: false,
        message: e instanceof Error ? e.message : "Failed",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // 4. Telegram — primary check is "is the bot token valid and reachable?".
  //    Whether *this* user has a personal chat linked is reported as a hint
  //    in the message, not as a failure: the bot can still send / receive
  //    updates without per-user linking, and notifications are only blocked
  //    for the unlinked user, not the system as a whole.
  {
    const startedAt = Date.now();
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        results.telegram = { ok: false, message: "TELEGRAM_BOT_TOKEN not set" };
      } else {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const latencyMs = Date.now() - startedAt;
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
            latencyMs,
          };
        } else {
          results.telegram = { ok: false, message: data.description || "Invalid bot token", latencyMs };
        }
      }
    } catch (e) {
      results.telegram = {
        ok: false,
        message: e instanceof Error ? e.message : "Failed",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // 5. Database — quick ping using the same drizzle client the rest of the
  // app uses so a failed driver / migration surfaces here.
  {
    const startedAt = Date.now();
    try {
      await db.query.users.findFirst({ columns: { id: true } });
      const latencyMs = Date.now() - startedAt;
      results.database = { ok: true, message: `SQLite reachable`, latencyMs };
    } catch (e) {
      results.database = {
        ok: false,
        message: e instanceof Error ? e.message : "Failed",
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  return NextResponse.json(results);
}
