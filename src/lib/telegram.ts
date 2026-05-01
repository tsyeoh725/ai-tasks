import { Bot } from "grammy";
import { db } from "@/db";
import { telegramLinks, tasks, taskComments } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { generateAiResponse } from "@/lib/ai";
import { v4 as uuid } from "uuid";

let bot: Bot | null = null;

// Pending link codes: code -> userId
const pendingLinks = new Map<string, string>();

export function generateLinkCode(userId: string): string {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  pendingLinks.set(code, userId);
  // Auto-expire after 10 minutes
  setTimeout(() => pendingLinks.delete(code), 10 * 60 * 1000);
  return code;
}

export function getTelegramBot(): Bot | null {
  if (bot) return bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  bot = new Bot(token);

  // /start command with linking code
  bot.command("start", async (ctx) => {
    const code = ctx.match?.trim();

    if (code && pendingLinks.has(code)) {
      const userId = pendingLinks.get(code)!;
      pendingLinks.delete(code);

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
    } else {
      await ctx.reply("Welcome to AI Tasks Bot!\n\nTo link your account, go to Settings in the web app and click 'Link Telegram'.\n\nIf you already have a code, send:\n/start YOUR_CODE");
    }
  });

  // /task command for AI chat
  bot.command("task", async (ctx) => {
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
      const response = await generateAiResponse(systemPrompt, message);

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
  bot.command("digest", async (ctx) => {
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
        `My tasks:\n${taskList}\n\nGive me my daily briefing.`
      );
      await ctx.reply(response);
    } catch {
      await ctx.reply("AI digest unavailable. Try again later.");
    }
  });

  // /help command
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "AI Tasks Bot Commands:\n\n" +
      "/task <id> <message> - Discuss a task with AI\n" +
      "/digest - Get your daily task digest\n" +
      "/help - Show this help message\n\n" +
      "You can find task IDs in the web app."
    );
  });

  return bot;
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
  const b = getTelegramBot();
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

// Start the bot (call once at server startup)
export async function startTelegramBot() {
  const b = getTelegramBot();
  if (!b) return;

  try {
    await b.start();
    console.log("Telegram bot started");
  } catch (err) {
    console.error("Failed to start Telegram bot:", err);
  }
}
