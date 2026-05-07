import { Bot } from "grammy";
import { randomBytes } from "crypto";
import { db } from "@/db";
import {
  telegramLinkCodes,
  telegramLinks,
  tasks,
  taskComments,
} from "@/db/schema";
import { eq, and, ne, lt } from "drizzle-orm";
import { generateAiResponse } from "@/lib/ai";
import { chatWithJarvis, getOrCreateJarvisConversation } from "@/lib/jarvis-chat";
import { v4 as uuid } from "uuid";

// Telegram's hard ceiling per message. The bot API rejects anything longer.
// Splitting on paragraph boundaries first, then sentence/newline, gives the
// nicest reading experience; we fall back to a hard slice if a single
// paragraph is itself too long.
const TELEGRAM_MAX_MESSAGE_LEN = 4000; // a touch under 4096 to leave headroom

function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_MESSAGE_LEN) return [text];

  const out: string[] = [];
  let buf = "";
  // Split on double-newline first (paragraphs), then on single-newline if a
  // paragraph itself is oversized. Anything still oversized gets a hard slice.
  for (const para of text.split(/\n\n+/)) {
    const piece = para + "\n\n";
    if (buf.length + piece.length <= TELEGRAM_MAX_MESSAGE_LEN) {
      buf += piece;
    } else {
      if (buf) out.push(buf.trimEnd());
      if (piece.length <= TELEGRAM_MAX_MESSAGE_LEN) {
        buf = piece;
      } else {
        // Oversized paragraph — slice it directly. Loses some readability
        // but better than dropping the message.
        for (let i = 0; i < piece.length; i += TELEGRAM_MAX_MESSAGE_LEN) {
          out.push(piece.slice(i, i + TELEGRAM_MAX_MESSAGE_LEN));
        }
        buf = "";
      }
    }
  }
  if (buf.trim()) out.push(buf.trimEnd());
  return out;
}

let bot: Bot | null = null;
// Cache the init promise so concurrent webhook hits during cold start share
// the same getMe round-trip instead of racing.
let botInitPromise: Promise<Bot | null> | null = null;

const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a short-lived linking code and persist it in `telegram_link_codes`.
 *
 * Earlier versions stored codes in an in-memory Map, which lost every code on
 * container restart — meaning every deploy left users staring at "Welcome to
 * AI Tasks Bot!" instead of "Successfully linked!". DB-backed codes survive
 * restarts and span multiple processes if we ever scale out.
 *
 * SL-6: codes are derived from `crypto.randomBytes`, not Math.random (which
 * is V8-predictable from a few outputs). The alphabet excludes 0/O/1/I/L
 * for typing legibility — users dictate these to a Telegram chat.
 *
 * SL-14: insert is wrapped in a retry loop in case of unique-key collisions.
 * Astronomically rare with crypto-random codes (8 chars × 32-symbol alphabet
 * = 2^40 keyspace, only valid for 10 minutes), but unhandled collisions
 * previously surfaced as a 500 to the user.
 */
const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // skip 0/O/1/I/L for legibility
const LINK_CODE_LENGTH = 8;

function newLinkCodeString(): string {
  const bytes = randomBytes(LINK_CODE_LENGTH);
  let s = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    s += LINK_CODE_ALPHABET[bytes[i] % LINK_CODE_ALPHABET.length];
  }
  return s;
}

export async function generateLinkCode(userId: string): Promise<string> {
  // Opportunistic GC of expired rows so the table doesn't grow forever.
  // Runs on every code generation — cheap because the index on expires_at
  // makes it a quick range delete.
  await db.delete(telegramLinkCodes).where(lt(telegramLinkCodes.expiresAt, new Date()));

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newLinkCodeString();
    try {
      await db.insert(telegramLinkCodes).values({
        code,
        userId,
        expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
      });
      return code;
    } catch (err) {
      // Unique-constraint violation on the primary key column → regenerate.
      // Anything else (DB unavailable, schema mismatch, etc.) is fatal —
      // bail out on the last attempt.
      if (attempt === 4) throw err;
    }
  }
  throw new Error("unreachable");
}

/**
 * Returns a fully-initialized grammy Bot, or null if no token is configured.
 *
 * grammy's `bot.handleUpdate` requires `bot.init()` to have run at least once
 * (it caches the bot's identity from getMe). Because we run in webhook mode
 * — not the polling mode that would call init via `bot.start()` — we have to
 * trigger init ourselves the first time the bot is requested.
 */
export async function getTelegramBot(): Promise<Bot | null> {
  if (bot) return bot;
  if (botInitPromise) return botInitPromise;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  botInitPromise = (async () => {
    const b = new Bot(token);

  // /start command with linking code
  b.command("start", async (ctx) => {
    const code = ctx.match?.trim();

    // Resolve the code through the DB. Returns the row only if the code
    // exists and hasn't expired — anything else falls through to the
    // generic welcome message.
    const codeRow = code
      ? await db.query.telegramLinkCodes.findFirst({
          where: eq(telegramLinkCodes.code, code),
        })
      : null;
    const codeValid = codeRow && codeRow.expiresAt.getTime() > Date.now();

    if (codeRow && codeValid) {
      const userId = codeRow.userId;
      // One-shot: consume the code immediately so it can't be replayed.
      await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.code, code!));

      const chatId = ctx.chat.id.toString();
      const username = ctx.from?.username || null;

      // Check if already linked
      const existing = await db.query.telegramLinks.findFirst({
        where: eq(telegramLinks.userId, userId),
      });

      if (existing) {
        await db.update(telegramLinks)
          .set({ telegramChatId: chatId, telegramUsername: username, linkedAt: new Date() })
          .where(eq(telegramLinks.id, existing.id));
      } else {
        await db.insert(telegramLinks).values({
          id: uuid(),
          userId,
          telegramChatId: chatId,
          telegramUsername: username,
        });
      }

      await ctx.reply(
        "Successfully linked! You're now talking to Jarvis on Telegram.\n\n" +
        "Just message me normally — I have full access to your workspace and can:\n" +
        "• Create / list / complete tasks\n" +
        "• Summarize your schedule, projects, and ad campaigns\n" +
        "• Approve or reject ad recommendations\n" +
        "• Pause / activate Meta ads\n" +
        "• Send Telegram pings to teammates\n\n" +
        "I remember the last 20 turns. Send /reset to clear memory, /help for commands.",
      );
    } else if (code) {
      // User typed a code but it didn't match — distinguish from "no code at
      // all" so they know to generate a new one.
      await ctx.reply("That code is invalid or has expired. Generate a fresh one in Settings → Link Telegram, then send /start <new_code>.");
    } else {
      await ctx.reply("Welcome to AI Tasks Bot!\n\nTo link your account, go to Settings in the web app and click 'Link Telegram'.\n\nIf you already have a code, send:\n/start YOUR_CODE");
    }
  });

  // /task command for AI chat
  b.command("task", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const link = await db.query.telegramLinks.findFirst({
      where: eq(telegramLinks.telegramChatId, chatId),
    });

    if (!link) {
      await ctx.reply("Account not linked. Visit Settings in the web app to link.");
      return;
    }

    const parts = ctx.match?.trim().split(/\s+/) || [];
    const taskId = parts[0];
    const message = parts.slice(1).join(" ");

    if (!taskId || !message) {
      await ctx.reply("Usage: /task <task-id> <your message>\n\nExample: /task abc123 How should I approach this?");
      return;
    }

    // Find the task
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      with: {
        project: { columns: { name: true } },
        subtasks: true,
      },
    });

    if (!task) {
      await ctx.reply("Task not found. Check the task ID.");
      return;
    }

    // Save user message
    await db.insert(taskComments).values({
      id: uuid(),
      taskId,
      content: message,
      authorId: link.userId,
      isAi: false,
    });

    const systemPrompt = `You are an AI task assistant on Telegram. Be concise (under 200 words).
Task: "${task.title}" | Status: ${task.status} | Priority: ${task.priority} | Project: ${task.project.name}
${task.description ? `Description: ${task.description}` : ""}`;

    try {
      const response = await generateAiResponse(systemPrompt, message, {
        callSite: "lib.telegram.task-reply",
        userId: link.userId,
      });

      // Save AI response
      await db.insert(taskComments).values({
        id: uuid(),
        taskId,
        content: response,
        authorId: null,
        isAi: true,
      });

      await ctx.reply(`AI: ${response}`);
    } catch {
      await ctx.reply("Sorry, AI is unavailable right now. Try again later.");
    }
  });

  // /digest command
  b.command("digest", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const link = await db.query.telegramLinks.findFirst({
      where: eq(telegramLinks.telegramChatId, chatId),
    });

    if (!link) {
      await ctx.reply("Account not linked.");
      return;
    }

    // Get user's active tasks
    const userTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.createdById, link.userId),
        ne(tasks.status, "done"),
      ),
      with: { project: { columns: { name: true } } },
      limit: 30,
    });

    if (userTasks.length === 0) {
      await ctx.reply("No active tasks. You're all caught up!");
      return;
    }

    const taskList = userTasks.map((t) =>
      `- [${t.priority}] "${t.title}" (${t.project.name})${t.dueDate ? ` due ${new Date(t.dueDate).toLocaleDateString()}` : ""}`
    ).join("\n");

    try {
      const response = await generateAiResponse(
        "You are a productivity assistant on Telegram. Be very concise (under 150 words). Give a daily briefing.",
        `My tasks:\n${taskList}\n\nGive me my daily briefing.`,
        { callSite: "lib.telegram.digest", userId: link.userId },
      );
      await ctx.reply(response);
    } catch {
      await ctx.reply("AI digest unavailable. Try again later.");
    }
  });

  // /reset — clear the active Jarvis conversation so the next message
  // starts a fresh thread with no memory of earlier turns.
  b.command("reset", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const link = await db.query.telegramLinks.findFirst({
      where: eq(telegramLinks.telegramChatId, chatId),
    });
    if (!link) {
      await ctx.reply("Account not linked. Visit Settings in the web app to link.");
      return;
    }
    await db.update(telegramLinks)
      .set({ activeConversationId: null })
      .where(eq(telegramLinks.id, link.id));
    await ctx.reply("Memory cleared. Next message starts a fresh conversation.");
  });

  // /help command
  b.command("help", async (ctx) => {
    await ctx.reply(
      "Jarvis on Telegram — what I can do:\n\n" +
      "Just message me normally and I'll respond with full access to your workspace. I can:\n" +
      "• List, create, update, complete tasks\n" +
      "• Summarize projects, brands, schedule\n" +
      "• Approve/reject ad recommendations\n" +
      "• Pause/activate Meta ads\n" +
      "• Block time on your calendar\n" +
      "• Send Telegram pings to teammates\n\n" +
      "Commands:\n" +
      "/task <id> <message> – Discuss a specific task by id\n" +
      "/digest – Today's briefing of active tasks\n" +
      "/reset – Clear conversation memory\n" +
      "/help – This message\n\n" +
      "Memory: I remember the last 20 turns of our chat. Use /reset to start fresh."
    );
  });

  // Plain-text catch-all — pipes any non-command message to Jarvis.
  // Registered AFTER all command handlers so grammy resolves the slash
  // commands first; this only fires when nothing else matched.
  b.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (!text) return;

    // Slash-prefix messages that didn't hit a command handler are typos
    // or unimplemented commands. Don't bill AI tokens on those — let them
    // pass silently so users notice their typo.
    if (text.startsWith("/")) return;

    const chatId = ctx.chat.id.toString();
    const link = await db.query.telegramLinks.findFirst({
      where: eq(telegramLinks.telegramChatId, chatId),
    });

    if (!link) {
      await ctx.reply(
        "Hi! I can answer once your account is linked. Open the ai-tasks " +
        "web app, go to Settings → Telegram, and click Link Telegram to " +
        "get a code.",
      );
      return;
    }

    // Best-effort typing indicator — Telegram shows it for ~5 s, so on
    // longer AI calls it fades before the reply arrives. Good enough for
    // v1; we can refresh it if responses regularly run past the window.
    try {
      await ctx.replyWithChatAction("typing");
    } catch {
      /* non-fatal */
    }

    try {
      // Resolve the active Jarvis conversation for this Telegram link, or
      // create one. Storing the id on telegramLinks lets follow-up messages
      // share memory across turns without us hunting through aiConversations.
      const conv = await getOrCreateJarvisConversation({
        userId: link.userId,
        conversationId: link.activeConversationId,
        label: "Telegram",
      });
      // Persist the new conversation id back to the link if it changed
      // (either created fresh, or stale id rotated). One write per chat
      // session — not per message.
      if (conv.isNew || conv.id !== link.activeConversationId) {
        await db.update(telegramLinks)
          .set({ activeConversationId: conv.id })
          .where(eq(telegramLinks.id, link.id));
      }

      const result = await chatWithJarvis({
        userId: link.userId,
        conversationId: conv.id,
        message: text,
        transport: "telegram",
        // Telegram-specific guidance: no markdown (their parser is fussy),
        // keep replies tight, and surface a follow-up cue when there's more
        // to explore. The model is free to break this for hard cases.
        responseStyle:
          "Telegram chat. Keep responses tight (ideally under 600 chars). " +
          "Plain text only — no markdown formatting (Telegram's parser is " +
          "fussy and we send as plain text). Use line breaks and dashes for " +
          "lists. If a tool returned a long list, summarize the top items " +
          "and offer to drill in.",
      });

      // Telegram caps each message at 4096 chars; split long replies into
      // chunks so users don't lose the tail.
      for (const chunk of splitForTelegram(result.text)) {
        await ctx.reply(chunk);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[telegram] chat reply failed:", err);
      await ctx.reply(`Sorry, I couldn't reach Jarvis right now. (${msg})`);
    }
  });

    // Telegram requires us to fetch the bot's identity once before we can
    // dispatch updates via `handleUpdate`. Without this, every webhook fires
    // an "Bot not initialized" exception that we swallow, leaving the user
    // staring at silence.
    try {
      await b.init();
    } catch (err) {
      console.error("[telegram] bot.init() failed:", err);
      botInitPromise = null;
      return null;
    }

    bot = b;
    return b;
  })();

  return botInitPromise;
}

export interface SendTelegramMessageOptions {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  replyMarkup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
}

// Send a message to a user's linked Telegram. Returns true on success.
export async function sendTelegramMessage(
  userId: string,
  message: string,
  options: SendTelegramMessageOptions = {},
): Promise<boolean> {
  const b = await getTelegramBot();
  if (!b) return false;

  const link = await db.query.telegramLinks.findFirst({
    where: eq(telegramLinks.userId, userId),
  });

  if (!link) return false;

  try {
    await b.api.sendMessage(Number(link.telegramChatId), message, {
      ...(options.parseMode && { parse_mode: options.parseMode }),
      ...(options.replyMarkup && { reply_markup: options.replyMarkup }),
    });
    return true;
  } catch {
    // Failed to send - user may have blocked the bot
    return false;
  }
}

// Send an inline-keyboard prompt asking the user to approve/reject an AI Guard recommendation.
export async function sendApprovalPrompt(
  userId: string,
  journalEntry: {
    id: string;
    recommendation: string;
    adName: string;
    brandName: string;
    reason: string;
    confidence: number;
  },
): Promise<boolean> {
  const text = `🤖 <b>Approval needed</b>\n\n<b>Action:</b> ${journalEntry.recommendation}\n<b>Ad:</b> ${journalEntry.adName}\n<b>Brand:</b> ${journalEntry.brandName}\n<b>Reason:</b> ${journalEntry.reason}\n<b>Confidence:</b> ${Math.round(journalEntry.confidence * 100)}%`;

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve:${journalEntry.id}` },
      { text: "❌ Reject", callback_data: `reject:${journalEntry.id}` },
    ]],
  };

  return sendTelegramMessage(userId, text, { parseMode: "HTML", replyMarkup: keyboard });
}

// startTelegramBot() removed: we run in webhook mode (Telegram POSTs to
// /api/telegram/callback). Polling and webhook are mutually exclusive at the
// Telegram API level. Initialization now happens on first use inside
// getTelegramBot() — no separate boot step required.
