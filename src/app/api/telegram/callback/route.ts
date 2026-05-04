// Telegram webhook endpoint for inline-keyboard callbacks. Handles the
// "Approve" / "Reject" buttons on approval prompts sent by sendApprovalPrompt.
import { db } from "@/db";
import { decisionJournal, telegramLinks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getTelegramBot } from "@/lib/telegram";
import { executeJournalEntry } from "@/lib/marketing/action-executor";
import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  let update: TelegramUpdate;
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
    update = raw as unknown as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bot = getTelegramBot();
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
    await db
      .update(decisionJournal)
      .set({ guardVerdict: "approved" })
      .where(eq(decisionJournal.id, journalId));

    try {
      const result = await executeJournalEntry(journalId, { manualApproval: true });
      answerText = result.success ? "Approved and executed" : "Approved but action failed";
      editSuffix = result.success
        ? "\n\n✅ <b>Approved — action executed</b>"
        : `\n\n⚠️ <b>Approved — action failed:</b> ${result.error ?? "unknown error"}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      answerText = "Approved but execution threw";
      editSuffix = `\n\n⚠️ <b>Approved — execution error:</b> ${msg}`;
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
