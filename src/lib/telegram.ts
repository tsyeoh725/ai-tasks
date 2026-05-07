import { Bot } from "grammy";
import { db } from "@/db";
import {
  telegramLinkCodes,
  telegramLinks,
  tasks,
  taskComments,
} from "@/db/schema";
import { eq, and, ne, lt } from "drizzle-orm";
import { generateAiResponse } from "@/lib/ai";
import { v4 as uuid } from "uuid";

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
 */
export async function generateLinkCode(userId: string): Promise<string> {
  // Opportunistic GC of expired rows so the table doesn't grow forever.
  // Runs on every code generation — cheap because the index on expires_at
  // makes it a quick range delete.
  await db.delete(telegramLinkCodes).where(lt(telegramLinkCodes.expiresAt, new Date()));

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  await db.insert(telegramLinkCodes).values({
    code,
    userId,
    expiresAt: new Date(Date.now() + LINK_CODE_TTL_MS),
  });
  return code;
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

      await ctx.reply("Successfully linked! You will now receive task notifications here.\n\nCommands:\n/task <id> <message> - Chat with AI about a task\n/digest - Get your daily digest\n/help - Show commands");
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

  // /help command
  b.command("help", async (ctx) => {
    await ctx.reply(
      "AI Tasks Bot Commands:\n\n" +
      "/task <id> <message> - Discuss a task with AI\n" +
      "/digest - Get your daily task digest\n" +
      "/help - Show this help message\n\n" +
      "You can find task IDs in the web app."
    );
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
