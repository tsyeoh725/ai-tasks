// Telegram webhook endpoint for inline-keyboard callbacks + grammy-handled
// commands. SL-2: this URL is publicly visible at the Cloudflare Tunnel
// hostname, so URL secrecy is NOT authentication. Every request is verified
// against the `X-Telegram-Bot-Api-Secret-Token` header, which Telegram
// echoes back when the webhook is registered with `secret_token=<value>`:
//
//   curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
//     --data-urlencode "url=https://task.edgepoint.work/api/telegram/callback" \
//     --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
//
// Without this, anyone POSTing forged `update.message` payloads to this URL
// could trigger the entire Jarvis tool surface on any linked user.
import { db } from "@/db";
import { decisionJournal, telegramLinks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getTelegramBot } from "@/lib/telegram";
import { executeJournalEntry } from "@/lib/marketing/action-executor";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

interface TelegramCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: unknown;
  edited_message?: unknown;
  channel_post?: unknown;
}

function verifyTelegramSignature(req: Request): true | NextResponse {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) {
    // Fail closed: refuse all traffic until the secret is configured. The
    // Telegram bot will appear silent until ops sets the env var and
    // re-registers the webhook with secret_token=<value>.
    console.error(
      "[telegram] FATAL: TELEGRAM_WEBHOOK_SECRET not set — refusing all webhook traffic. " +
        "Set the env var, then re-register the webhook with `secret_token=<value>` via setWebhook.",
    );
    return NextResponse.json({ error: "misconfigured" }, { status: 503 });
  }
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  const a = Buffer.from(got || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return true;
}

export async function POST(req: Request) {
  // SL-2: verify the request actually came from Telegram before processing.
  const sig = verifyTelegramSignature(req);
  if (sig !== true) return sig;

  let update: TelegramUpdate;
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
    update = raw as unknown as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bot = await getTelegramBot();
  if (!bot) {
    return NextResponse.json({ error: "Telegram bot not configured" }, { status: 500 });
  }

  // Non-callback updates (text commands like /start, /task, /digest, …) get
  // dispatched to grammy so the handlers registered in src/lib/telegram.ts run.
  // Callback queries (inline-keyboard Approve/Reject) keep their custom path
  // below because grammy doesn't have those handlers wired up.
  if (!update.callback_query) {
    try {
      // grammy's Update type matches the Telegram Bot API; cast through unknown.
      await bot.handleUpdate(raw as unknown as Parameters<typeof bot.handleUpdate>[0]);
    } catch (err) {
      console.error("[telegram] handleUpdate failed:", err);
    }
    return NextResponse.json({ ok: true });
  }

  const cb = update.callback_query;
  if (!cb.data) {
    return NextResponse.json({ ok: true });
  }

  // Parse "approve:<id>" or "reject:<id>"
  const [action, journalId] = cb.data.split(":");
  if ((action !== "approve" && action !== "reject") || !journalId) {
    await bot.api.answerCallbackQuery(cb.id, { text: "Unknown action" });
    return NextResponse.json({ ok: true });
  }

  // Verify the Telegram user is linked and owns the journal entry.
  const chatId = cb.message?.chat.id.toString();
  if (!chatId) {
    await bot.api.answerCallbackQuery(cb.id, { text: "Missing chat context" });
    return NextResponse.json({ ok: true });
  }

  const link = await db.query.telegramLinks.findFirst({
    where: eq(telegramLinks.telegramChatId, chatId),
  });
  if (!link) {
    await bot.api.answerCallbackQuery(cb.id, { text: "Account not linked." });
    return NextResponse.json({ ok: true });
  }

  const entry = await db.query.decisionJournal.findFirst({
    where: and(eq(decisionJournal.id, journalId), eq(decisionJournal.userId, link.userId)),
  });
  if (!entry) {
    await bot.api.answerCallbackQuery(cb.id, { text: "Entry not found or not owned by you." });
    return NextResponse.json({ ok: true });
  }

  if (entry.guardVerdict !== "pending") {
    await bot.api.answerCallbackQuery(cb.id, { text: `Already ${entry.guardVerdict}` });
    return NextResponse.json({ ok: true });
  }

  let answerText: string;
  let editSuffix: string;

  if (action === "approve") {
    // SL-14: execute first, mark approved only on success. The previous
    // order (approve → execute) was fail-closed-for-retry but fail-open-
    // for-the-user: if the action threw, the row was already "approved" so
    // a retry click short-circuited (`entry.guardVerdict !== "pending"`).
    // The user thought they approved but no Meta action ran, with no way
    // to recover from Telegram. Now: failure leaves the row as "pending"
    // so the user can click Approve again. Duplicate execution is guarded
    // by decisionJournal.actionTaken inside the executor.
    try {
      const result = await executeJournalEntry(journalId, { manualApproval: true });
      if (result.success) {
        await db
          .update(decisionJournal)
          .set({ guardVerdict: "approved" })
          .where(eq(decisionJournal.id, journalId));
        answerText = "Approved and executed";
        editSuffix = "\n\n✅ <b>Approved — action executed</b>";
      } else {
        answerText = "Action failed — leaving as pending so you can retry";
        editSuffix = `\n\n⚠️ <b>Action failed:</b> ${result.error ?? "unknown error"}\nTap Approve again to retry, or Reject to abandon.`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      answerText = "Execution threw — leaving as pending so you can retry";
      editSuffix = `\n\n⚠️ <b>Execution error:</b> ${msg}\nTap Approve again to retry, or Reject to abandon.`;
    }
  } else {
    await db
      .update(decisionJournal)
      .set({ guardVerdict: "rejected" })
      .where(eq(decisionJournal.id, journalId));
    answerText = "Rejected";
    editSuffix = "\n\n❌ <b>Rejected — no action taken</b>";
  }

  await bot.api.answerCallbackQuery(cb.id, { text: answerText });

  if (cb.message) {
    const originalText = cb.message.text ?? "(approval prompt)";
    try {
      await bot.api.editMessageText(
        cb.message.chat.id,
        cb.message.message_id,
        `${originalText}${editSuffix}`,
        { parse_mode: "HTML" },
      );
    } catch {
      // Edits fail silently (message might be too old, etc.)
    }
  }

  return NextResponse.json({ ok: true });
}
