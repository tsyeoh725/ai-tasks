// ─── Jarvis chat (transport-agnostic) ────────────────────────────────────────
//
// Wraps the same context + tool surface that powers /api/ai/command in the web
// app, but with a thin functional API that any chat transport (Telegram now,
// SMS/email/voice later) can plug into. Two-call shape on purpose:
//
//   const conv = await getOrCreateJarvisConversation({ userId, label: "Telegram" });
//   const reply = await chatWithJarvis({ conversationId: conv.id, userId, message });
//
// The helper persists user + assistant turns to the same `aiMessages` table
// the web chat uses, so the conversation history shows up in the web app's
// chat list — one unified Jarvis history regardless of which surface the
// user typed into.

import { streamText, stepCountIs, type ModelMessage } from "ai";
import { v4 as uuid } from "uuid";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  aiConversations,
  aiMessages,
  projects,
  teamMembers,
  timeBlocks,
  userPreferences,
  users,
} from "@/db/schema";
import { gte, lte } from "drizzle-orm";
import { getJarvisModel, isAiConfigured } from "./ai";
import { fromAiSdkUsage, recordAiUsage } from "./ai-usage";
import { getCommandTools } from "./ai-tools";
import { resolveUserTimezone, formatNowInZone } from "./datetime";

// Cap how many prior turns we replay to the model. The full history lives in
// the DB; we just don't want a 90-message thread blowing the prompt budget.
const HISTORY_LIMIT = 20;

// Tool-chain budget per turn. Same as the web /api/ai/command route — five
// hops is enough for "list brands → check health → pause one ad" style flows
// without runaway loops on a flaky tool.
const STEP_BUDGET = 5;

export type ChatTransport = "telegram" | "web" | "sms" | "email" | "voice";

export interface JarvisConversation {
  id: string;
  userId: string;
  title: string;
  isNew: boolean;
}

/**
 * Find an existing Jarvis conversation by id (validating ownership), or
 * create a new one for the user. Used by transports that already track
 * which conversation a chat session belongs to (e.g. Telegram links store
 * `activeConversationId`).
 */
export async function getOrCreateJarvisConversation({
  userId,
  conversationId,
  label,
}: {
  userId: string;
  conversationId?: string | null;
  label: string;
}): Promise<JarvisConversation> {
  // Existing conversation — verify it belongs to the requesting user.
  if (conversationId) {
    const existing = await db.query.aiConversations.findFirst({
      where: and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.userId, userId),
      ),
    });
    if (existing) {
      return { id: existing.id, userId, title: existing.title, isNew: false };
    }
    // Stale id (conversation deleted, or wrong user) — fall through to create
    // a fresh one. Returning an error here would break Telegram users any
    // time they reset their web history.
  }

  const id = uuid();
  const title = `${label} · ${new Date().toLocaleDateString("en-CA")}`; // YYYY-MM-DD
  await db.insert(aiConversations).values({ id, userId, title });
  return { id, userId, title, isNew: true };
}

export interface ChatWithJarvisInput {
  userId: string;
  conversationId: string;
  message: string;
  transport: ChatTransport;
  // Per-transport response style guidance appended to the system prompt
  // (e.g. "Telegram: keep replies under 600 chars, no markdown").
  responseStyle?: string;
}

export interface ChatWithJarvisResult {
  text: string;
  conversationId: string;
  toolCalls: number;
  finishReason: string | null;
}

/**
 * Run a single chat turn through Jarvis. Loads prior history, builds workspace
 * context, runs the model with the full tool surface, and persists the user
 * + assistant turns. Returns the final assistant text (after any tool steps)
 * so the transport can deliver it to the user.
 *
 * Throws if AI is not configured. Callers should catch and surface a friendly
 * "AI offline" message rather than letting the error bubble to the user.
 */
export async function chatWithJarvis(
  input: ChatWithJarvisInput,
): Promise<ChatWithJarvisResult> {
  if (!(await isAiConfigured())) {
    throw new Error(
      "Jarvis is not configured. Add an OpenAI key under Settings → AI in the web app.",
    );
  }

  const { userId, conversationId, message, transport, responseStyle } = input;

  // 1. Fetch user + workspace context (mirrors /api/ai/command). We re-do
  //    this every turn because tasks/schedule change frequently and stale
  //    context produces wrong answers (e.g. "you have no overdue tasks"
  //    when there are 3).
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error(`User ${userId} not found`);

  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    with: { team: { columns: { id: true, name: true } } },
  });

  const userProjects = await db.query.projects.findMany({
    where: eq(projects.ownerId, userId),
    columns: { id: true, name: true },
    limit: 20,
  });

  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });
  const workHoursInfo = prefs
    ? `Work hours: ${prefs.workStartTime}-${prefs.workEndTime}, Lunch: ${prefs.lunchStartTime}-${prefs.lunchEndTime}, Focus preference: ${prefs.focusTimePreference}`
    : "Work hours: not configured (defaults: 09:00-17:00)";
  const userTz = resolveUserTimezone(prefs?.timezone);
  const nowInZone = formatNowInZone(userTz);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const todayBlocks = await db.query.timeBlocks.findMany({
    where: and(
      eq(timeBlocks.userId, userId),
      gte(timeBlocks.startTime, todayStart),
      lte(timeBlocks.endTime, todayEnd),
    ),
  });

  const scheduleSummary = todayBlocks.length > 0
    ? `Today's schedule: ${todayBlocks.length} blocks booked (${todayBlocks.map(b => `${b.title} ${b.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}-${b.endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`).join(", ")})`
    : "Today's schedule: No blocks scheduled yet.";

  const userContext = `Current user: ${user.name} (${user.email}), User ID: ${user.id}
User's teams: ${userTeams.length > 0 ? userTeams.map(t => `${t.team.name} (${t.team.id})`).join(", ") : "None"}
User's projects: ${userProjects.length > 0 ? userProjects.map(p => `${p.name} (${p.id})`).join(", ") : "None"}
${workHoursInfo}
${scheduleSummary}
Current local time: ${nowInZone}.
Use this timezone (${userTz}) for ALL datetime fields. When the user says "later at 4pm", "tomorrow morning", "EOD" etc, resolve to a concrete ISO datetime in this zone (e.g. "2026-05-07T16:00") and pass that to tools.
Chat transport: ${transport}.`;

  const transportGuidance = responseStyle
    ? `\n\nTransport-specific guidance:\n${responseStyle}`
    : "";

  const systemPrompt = `You are Jarvis — the AI Command Center for Edge Point's task & marketing platform. You can create, update, delete tasks; manage projects, teams, schedule; send Telegram notifications; and operate Meta Ads recommendations.

${userContext}

Tool selection — IMPORTANT:
- "What's on my schedule?" / "What am I doing today?" → use **getMySchedule** (returns time blocks, NOT tasks).
- "What tasks do I have?" / "List my tasks" / "Show overdue tasks" → use **listTasks** or **queryOverdueTasks**.
- Tasks and schedule blocks are DIFFERENT: tasks live in the tasks table; schedule blocks live in timeBlocks.
- Do NOT call the same tool multiple times with the same arguments. Empty result means "none" — say so and stop.

Guidelines:
- Be concise and action-oriented.
- When the user asks to create/update/delete something, use the appropriate tool immediately.
- For ambiguous requests, use searchUsers or listProjects to find the right IDs before acting.
- Always confirm destructive actions (delete) with the result.
- When sending Telegram messages, use searchUsers first if you don't know the recipient's user ID.
- You can chain multiple tools in one response for complex requests like "create a project and add 3 tasks to it."
- When assigning tasks to the current user, use their User ID shown above. Do NOT pass name or email as assigneeId.

Schedule-Aware Prioritization:
- When the user asks you to prioritize tasks, use analyzeWorkload first to check if tasks fit in available time.
- If tasks can't fit, proactively warn the user and suggest rescheduling using suggestReschedule.
- When blocking time for tasks, respect the user's focus time preference (deep work in preferred focus period).
- Use getMySchedule to see current blocks before adding new ones.

Marketing Tools (Meta Ads Optimizer):
- "How are my ads performing?" → listBrands + getBrandHealth
- "What approvals are pending?" → listPendingApprovals
- "Approve/reject this recommendation" → approveRecommendation / rejectRecommendation
- "Run the monitor now" → runMonitorCycle
- "Pause this ad" / "Activate this ad" → pauseAd / activateAd${transportGuidance}`;

  // 2. Load recent history. We persist only role=user / role=assistant text
  //    turns (no intermediate tool calls), which means the model loses the
  //    *details* of past tool runs but still sees the assistant's summary.
  //    Trade-off: cheaper tokens, simpler persistence; downside: if the user
  //    asks "show me that list again" the model has to re-run the tool.
  //    Acceptable for a chat surface — not for an audit log.
  const history = await db.query.aiMessages.findMany({
    where: eq(aiMessages.conversationId, conversationId),
    orderBy: [asc(aiMessages.createdAt)],
    limit: HISTORY_LIMIT,
  });

  const modelMessages: ModelMessage[] = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // 3. Persist the new user message *before* streaming so a model crash
  //    doesn't drop the user's input into the void. The assistant response
  //    is persisted in onFinish below.
  await db.insert(aiMessages).values({
    id: uuid(),
    conversationId,
    role: "user",
    content: message,
  });

  modelMessages.push({ role: "user", content: message });

  // 4. Run the model with the full tool surface.
  const { model, modelId } = await getJarvisModel();
  const tools = getCommandTools(userId, userTz);
  const startedAt = Date.now();
  let toolCalls = 0;
  let finishReason: string | null = null;
  let captured: unknown = null;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(STEP_BUDGET),
    onStepFinish({ toolCalls: stepToolCalls }) {
      toolCalls += stepToolCalls?.length ?? 0;
    },
    async onFinish({ text, usage, finishReason: reason }) {
      finishReason = reason;
      // Persist the assistant text *only*; tool steps stay in the audit log
      // via recordAiUsage and the model's natural language summary captures
      // the user-facing outcome.
      if (text) {
        await db.insert(aiMessages).values({
          id: uuid(),
          conversationId,
          role: "assistant",
          content: text,
        });
      }

      await db.update(aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(aiConversations.id, conversationId));

      await recordAiUsage({
        feature: "jarvis",
        callSite: `lib.jarvis-chat.${transport}`,
        provider: "openai",
        model: modelId,
        userId,
        conversationId,
        ...fromAiSdkUsage(usage),
        latencyMs: Date.now() - startedAt,
        status: reason === "error" ? "error" : "success",
      });
    },
    onError({ error }) {
      captured = error;
      console.error("[jarvis-chat] streamText error:", error);
      const msg = error instanceof Error ? error.message : String(error);
      void recordAiUsage({
        feature: "jarvis",
        callSite: `lib.jarvis-chat.${transport}`,
        provider: "openai",
        model: modelId,
        userId,
        conversationId,
        latencyMs: Date.now() - startedAt,
        status: /rate.?limit|429/i.test(msg) ? "rate_limited" : "error",
        errorMessage: msg,
      });
    },
  });

  // Drain the stream to collect the final text. We don't expose streaming to
  // the caller because Telegram's bot API doesn't support partial messages
  // anyway — and other future transports (SMS, email) won't either. If a
  // transport eventually wants live streaming, it can call streamText itself
  // with the same context build above.
  let text = "";
  for await (const chunk of result.textStream) {
    text += chunk;
  }

  if (!text && captured) {
    const msg = captured instanceof Error ? captured.message : String(captured);
    throw new Error(msg);
  }

  return {
    text: text || "(Jarvis returned no response — check Settings → AI for a valid key.)",
    conversationId,
    toolCalls,
    finishReason,
  };
}
