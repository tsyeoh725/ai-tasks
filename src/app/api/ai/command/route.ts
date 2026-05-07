import { db } from "@/db";
import { aiConversations, aiMessages, projects, teamMembers, userPreferences, timeBlocks } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { getJarvisModel } from "@/lib/ai";
import { fromAiSdkUsage, recordAiUsage } from "@/lib/ai-usage";
import { getCommandTools } from "@/lib/ai-tools";
import { enforceAiRateLimit, AiRateLimitError } from "@/lib/ai-rate-limit";
import { resolveUserTimezone, formatNowInZone, startOfDayInZone, endOfDayInZone } from "@/lib/datetime";
import { getTeammate } from "@/lib/ai-teammates";
import { streamText, convertToModelMessages, stepCountIs, type UIMessage, type UIMessagePart, type UIDataTypes, type UITools } from "ai";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";

// Incoming UI message may include legacy `content` field used as fallback when no text part is present.
type IncomingUIMessage = UIMessage & { content?: string };
type IncomingUIPart = UIMessagePart<UIDataTypes, UITools>;

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return unauthorized();

    const body = await req.json();
    const { messages, id: chatId, teammate: teammateId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 });
    }

    // SL-9: per-user-per-minute / per-day cap. Throws AiRateLimitError;
    // we catch below and surface as 429 so the UI can show a friendly
    // "slow down" toast.
    try {
      await enforceAiRateLimit(user.id!);
    } catch (err) {
      if (err instanceof AiRateLimitError) {
        return NextResponse.json(
          { error: err.message, scope: err.scope, cap: err.cap },
          { status: 429 },
        );
      }
      throw err;
    }

    // Determine or create conversation
    let convId = chatId;

    if (convId) {
      // Verify ownership
      const conv = await db.query.aiConversations.findFirst({
        where: and(eq(aiConversations.id, convId), eq(aiConversations.userId, user.id!)),
      });
      if (!conv) {
        // Create new one with this id
        const firstUserMsg = (messages as IncomingUIMessage[]).find((m) => m.role === "user");
        const textPart = firstUserMsg?.parts?.find((p: IncomingUIPart): p is Extract<IncomingUIPart, { type: "text" }> => p.type === "text");
        const content = textPart?.text
          || firstUserMsg?.content
          || "New Chat";
        const title = typeof content === "string" ? content.substring(0, 80) : "New Chat";
        await db.insert(aiConversations).values({
          id: convId,
          userId: user.id!,
          title,
        });
      }
    } else {
      convId = uuid();
      const firstUserMsg = (messages as IncomingUIMessage[]).find((m) => m.role === "user");
      const textPart = firstUserMsg?.parts?.find((p: IncomingUIPart): p is Extract<IncomingUIPart, { type: "text" }> => p.type === "text");
      const content = textPart?.text
        || firstUserMsg?.content
        || "New Chat";
      const title = typeof content === "string" ? content.substring(0, 80) : "New Chat";
      await db.insert(aiConversations).values({
        id: convId,
        userId: user.id!,
        title,
      });
    }

    // Build system prompt with user context
    const userTeams = await db.query.teamMembers.findMany({
      where: eq(teamMembers.userId, user.id!),
      with: { team: { columns: { id: true, name: true } } },
    });

    const userProjects = await db.query.projects.findMany({
      where: eq(projects.ownerId, user.id!),
      columns: { id: true, name: true },
      limit: 20,
    });

    // Fetch schedule context
    const prefs = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id!),
    });
    const workHoursInfo = prefs
      ? `Work hours: ${prefs.workStartTime}-${prefs.workEndTime}, Lunch: ${prefs.lunchStartTime}-${prefs.lunchEndTime}, Focus preference: ${prefs.focusTimePreference}`
      : "Work hours: not configured (defaults: 09:00-17:00)";
    const userTz = resolveUserTimezone(prefs?.timezone);
    const nowInZone = formatNowInZone(userTz);

    // SL-7: midnight in userTz, not server tz.
    const todayStart = startOfDayInZone(userTz);
    const todayEnd = endOfDayInZone(userTz);

    const todayBlocks = await db.query.timeBlocks.findMany({
      where: and(
        eq(timeBlocks.userId, user.id!),
        gte(timeBlocks.startTime, todayStart),
        lte(timeBlocks.endTime, todayEnd),
      ),
    });

    const scheduleSummary = todayBlocks.length > 0
      ? `Today's schedule: ${todayBlocks.length} blocks booked (${todayBlocks.map(b => `${b.title} ${b.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}-${b.endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`).join(", ")})`
      : "Today's schedule: No blocks scheduled yet.";

    // User context injected into every prompt
    const userContext = `Current user: ${user.name} (${user.email}), User ID: ${user.id}
User's teams: ${userTeams.length > 0 ? userTeams.map(t => `${t.team.name} (${t.team.id})`).join(", ") : "None"}
User's projects: ${userProjects.length > 0 ? userProjects.map(p => `${p.name} (${p.id})`).join(", ") : "None"}
${workHoursInfo}
${scheduleSummary}
Current local time: ${nowInZone}.
Use this timezone (${userTz}) for ALL datetime fields. When the user says "later at 4pm", "tomorrow morning", "EOD" etc, resolve to a concrete ISO datetime in this zone (e.g. "2026-05-07T16:00") and pass that to tools.`;

    // Resolve persona (teammate) if provided, else use the general system prompt
    const teammate = typeof teammateId === "string" ? getTeammate(teammateId) : undefined;

    const defaultSystemPrompt = `You are an AI Command Center for a task management platform. You have full control over the platform and can create, update, delete tasks, manage projects, teams, send Telegram messages, and manage the user's schedule.

${userContext}

Tool selection — IMPORTANT:
- "What's on my schedule?" / "What am I doing today?" / "What's blocked in my calendar?" → use **getMySchedule** (returns time blocks from the user's calendar, NOT tasks).
- "What tasks do I have?" / "List my tasks" / "Show overdue tasks" → use **listTasks** or **queryOverdueTasks**.
- Tasks and schedule blocks are DIFFERENT: a task is a to-do item (stored in the tasks table); a schedule block is a time slot on the user's calendar (stored in timeBlocks). A task can have multiple blocks; a block can have no task.
- Do NOT call the same tool multiple times with the same arguments. If the first call returns empty, interpret that as "none" and say so.

Guidelines:
- Be concise and action-oriented.
- When the user asks to create/update/delete something, use the appropriate tool immediately.
- When listing tasks or projects, format the results in a clear readable way.
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
- Be helpful about time management: if the user is overloaded, suggest which tasks to defer.

Marketing Tools (Meta Ads Optimizer):
- "How are my ads performing?" → listBrands + getBrandHealth
- "What approvals are pending?" → listPendingApprovals
- "Approve/reject this recommendation" → approveRecommendation / rejectRecommendation
- "Run the monitor now" → runMonitorCycle
- "Pause this ad" / "Activate this ad" → pauseAd / activateAd

Ad health signals trigger automatic task creation (creative fatigue → "Need new creative" task, etc.) in the brand's linked project.`;

    const systemPrompt = teammate
      ? `${teammate.systemPrompt}\n\n${userContext}`
      : defaultSystemPrompt;

    const { model, modelId } = await getJarvisModel();
    const allTools = getCommandTools(user.id!, userTz);
    const tools = teammate?.toolAllowlist
      ? Object.fromEntries(
          Object.entries(allTools).filter(([k]) => teammate.toolAllowlist!.includes(k)),
        )
      : allTools;

    // Convert UI messages to model messages
    const modelMessages = await convertToModelMessages(messages);

    // Save the latest user message
    const lastUserMsg = messages[messages.length - 1] as IncomingUIMessage | undefined;
    if (lastUserMsg?.role === "user") {
      const textPart = lastUserMsg.parts?.find((p: IncomingUIPart): p is Extract<IncomingUIPart, { type: "text" }> => p.type === "text");
      const textContent = textPart?.text
        || lastUserMsg.content
        || "";
      await db.insert(aiMessages).values({
        id: uuid(),
        conversationId: convId,
        role: "user",
        content: typeof textContent === "string" ? textContent : JSON.stringify(textContent),
      });
    }

    const startedAt = Date.now();
    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      async onFinish({ text, usage, finishReason }) {
        // Save assistant message
        if (text) {
          await db.insert(aiMessages).values({
            id: uuid(),
            conversationId: convId,
            role: "assistant",
            content: text,
          });
        }

        await db.update(aiConversations)
          .set({ updatedAt: new Date() })
          .where(eq(aiConversations.id, convId));

        await recordAiUsage({
          feature: "jarvis",
          callSite: "/api/ai/command",
          provider: "openai",
          model: modelId,
          userId: user.id,
          conversationId: convId,
          ...fromAiSdkUsage(usage),
          latencyMs: Date.now() - startedAt,
          status: finishReason === "error" ? "error" : "success",
        });
      },
      onError({ error }) {
        console.error("[ai] command streamText error:", error);
        const msg = error instanceof Error ? error.message : String(error);
        const status = /rate.?limit|429/i.test(msg) ? "rate_limited" : "error";
        void recordAiUsage({
          feature: "jarvis",
          callSite: "/api/ai/command",
          provider: "openai",
          model: modelId,
          userId: user.id,
          conversationId: convId,
          latencyMs: Date.now() - startedAt,
          status,
          errorMessage: msg,
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("AI Command error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
