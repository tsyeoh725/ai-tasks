import { db } from "@/db";
import { tasks, projects, teamMembers } from "@/db/schema";
import { and, eq, or, isNull, inArray, gte, lt } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { streamAiResponse, isAiConfigured } from "@/lib/ai";
import { NextResponse } from "next/server";

// ─── Jarvis: personal AI overview for the dashboard ──────────────────────────
// POST: stream an AI response with full workspace context
// GET:  return a quick one-paragraph briefing

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function getContext(userId: string) {
  // Get all accessible project ids
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);
  const projectConds = [and(eq(projects.ownerId, userId), isNull(projects.teamId))];
  if (teamIds.length > 0) projectConds.push(inArray(projects.teamId, teamIds));

  const projectList = await db.query.projects.findMany({
    where: or(...projectConds),
    columns: { id: true, name: true, color: true, icon: true, category: true, campaign: true },
    limit: 100,
  });
  const projectIds = projectList.map((p) => p.id);

  if (projectIds.length === 0) {
    return {
      projectList: [],
      overdue: [],
      today: [],
      upcoming: [],
      urgent: [],
    };
  }

  const tomorrow = new Date(startOfDay());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekOut = new Date(tomorrow);
  weekOut.setDate(weekOut.getDate() + 7);

  const [overdue, today, upcoming, urgent] = await Promise.all([
    db.query.tasks.findMany({
      where: and(
        inArray(tasks.projectId, projectIds),
        lt(tasks.dueDate, startOfDay()),
        or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress"), eq(tasks.status, "blocked")),
      ),
      columns: { id: true, title: true, priority: true, status: true, dueDate: true, projectId: true },
      orderBy: (t, { asc }) => [asc(t.dueDate)],
      limit: 20,
    }),
    db.query.tasks.findMany({
      where: and(
        inArray(tasks.projectId, projectIds),
        gte(tasks.dueDate, startOfDay()),
        lt(tasks.dueDate, tomorrow),
        or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress")),
      ),
      columns: { id: true, title: true, priority: true, status: true, dueDate: true, projectId: true },
      orderBy: (t, { desc }) => [desc(t.priority)],
      limit: 20,
    }),
    db.query.tasks.findMany({
      where: and(
        inArray(tasks.projectId, projectIds),
        gte(tasks.dueDate, tomorrow),
        lt(tasks.dueDate, weekOut),
        or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress")),
      ),
      columns: { id: true, title: true, priority: true, status: true, dueDate: true, projectId: true },
      orderBy: (t, { asc }) => [asc(t.dueDate)],
      limit: 20,
    }),
    db.query.tasks.findMany({
      where: and(
        inArray(tasks.projectId, projectIds),
        eq(tasks.priority, "urgent"),
        or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress"), eq(tasks.status, "blocked")),
      ),
      columns: { id: true, title: true, priority: true, status: true, dueDate: true, projectId: true },
      limit: 20,
    }),
  ]);

  return { projectList, overdue, today, upcoming, urgent };
}

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof getContext>>, userName: string) {
  const projByCampaign = new Map<string, typeof ctx.projectList>();
  for (const p of ctx.projectList) {
    const key = p.campaign || "Ungrouped";
    if (!projByCampaign.has(key)) projByCampaign.set(key, []);
    projByCampaign.get(key)!.push(p);
  }

  const pidToProject = new Map(ctx.projectList.map((p) => [p.id, p]));

  const fmtTasks = (list: typeof ctx.overdue) =>
    list
      .map((t) => {
        const p = pidToProject.get(t.projectId);
        const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "";
        return `- [${t.priority}] ${t.title} (${p?.name ?? "unknown"}${due ? `, due ${due}` : ""})`;
      })
      .join("\n");

  return `You are Jarvis — ${userName}'s personal AI workspace assistant for Edge Point.
Brand voice: sharp, pragmatic, action-oriented. Keep answers tight — use bullet points and concrete next steps.
Never invent tasks or data. Only refer to what is in the workspace state below.

=== WORKSPACE STATE ===
${Array.from(projByCampaign.entries())
  .map(
    ([camp, projs]) =>
      `Campaign: ${camp}\n${projs.map((p) => `  · ${p.name}${p.category ? ` [client: ${p.category}]` : ""}`).join("\n")}`,
  )
  .join("\n\n")}

=== OVERDUE (${ctx.overdue.length}) ===
${fmtTasks(ctx.overdue) || "none"}

=== TODAY (${ctx.today.length}) ===
${fmtTasks(ctx.today) || "none"}

=== URGENT (${ctx.urgent.length}) ===
${fmtTasks(ctx.urgent) || "none"}

=== UPCOMING (next 7d — ${ctx.upcoming.length}) ===
${fmtTasks(ctx.upcoming) || "none"}`;
}

// ─── GET — daily briefing ────────────────────────────────────────────────────
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  if (!(await isAiConfigured())) {
    return NextResponse.json({
      error: "not_configured",
      briefing:
        "AI is not configured — add an OpenAI or Anthropic key under Settings → AI to enable Jarvis.",
    }, { status: 503 });
  }

  const ctx = await getContext(user.id!);
  const systemPrompt = buildSystemPrompt(ctx, user.name || "there");
  const prompt =
    "Give a 3-4 sentence briefing of my current workload. Lead with the single most urgent thing. Then give 2 concrete recommendations for what to tackle first. Be direct.";

  try {
    const result = await streamAiResponse(systemPrompt, prompt);
    let text = "";
    for await (const chunk of result.textStream) text += chunk;
    return NextResponse.json({
      briefing: text,
      stats: {
        overdue: ctx.overdue.length,
        today: ctx.today.length,
        urgent: ctx.urgent.length,
        upcoming: ctx.upcoming.length,
        projects: ctx.projectList.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — chat with Jarvis ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  if (!(await isAiConfigured())) {
    return NextResponse.json(
      { error: "AI is not configured. Add an OpenAI or Anthropic key under Settings → AI." },
      { status: 503 }
    );
  }

  const { message } = await req.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const ctx = await getContext(user.id!);
  const systemPrompt = buildSystemPrompt(ctx, user.name || "there");

  try {
    const result = await streamAiResponse(systemPrompt, message);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
