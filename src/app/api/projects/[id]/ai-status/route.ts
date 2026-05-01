import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { and, eq, gte, lt, ne, or } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { generateAiResponse } from "@/lib/ai";
import { NextResponse } from "next/server";

type StatusValue = "on_track" | "at_risk" | "off_track" | "on_hold" | "complete";

type DraftPayload = {
  status: StatusValue;
  summary: string;
  highlights: string[];
  blockers: string[];
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // Recently completed tasks (completedAt within last 7 days)
  const completed = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, id),
      eq(tasks.status, "done"),
      gte(tasks.completedAt, weekAgo),
    ),
    columns: { id: true, title: true, completedAt: true, priority: true },
    orderBy: (t, { desc }) => [desc(t.completedAt)],
  });

  // Slipping milestones (isMilestone or taskType=milestone, dueDate < now, not done)
  const slipping = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, id),
      or(eq(tasks.isMilestone, true), eq(tasks.taskType, "milestone")),
      lt(tasks.dueDate, now),
      ne(tasks.status, "done"),
    ),
    columns: { id: true, title: true, dueDate: true, status: true },
    orderBy: (t, { asc }) => [asc(t.dueDate)],
  });

  // Blocked tasks
  const blocked = await db.query.tasks.findMany({
    where: and(eq(tasks.projectId, id), eq(tasks.status, "blocked")),
    columns: { id: true, title: true, priority: true },
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });

  // Overall counts
  const all = await db.query.tasks.findMany({
    where: eq(tasks.projectId, id),
    columns: { status: true },
  });
  const counts = {
    total: all.length,
    done: all.filter((t) => t.status === "done").length,
    in_progress: all.filter((t) => t.status === "in_progress").length,
    todo: all.filter((t) => t.status === "todo").length,
    blocked: all.filter((t) => t.status === "blocked").length,
  };

  const completedList = completed
    .map((t) => `- ${t.title}${t.completedAt ? ` (completed ${new Date(t.completedAt).toLocaleDateString()})` : ""}`)
    .join("\n") || "(none)";
  const slippingList = slipping
    .map((t) => `- ${t.title}${t.dueDate ? ` (due ${new Date(t.dueDate).toLocaleDateString()}, still ${t.status})` : ""}`)
    .join("\n") || "(none)";
  const blockedList = blocked
    .map((t) => `- ${t.title} (${t.priority})`)
    .join("\n") || "(none)";

  const systemPrompt = `You draft concise project status updates. Return ONLY valid JSON like:
{ "status": "on_track|at_risk|off_track|on_hold|complete", "summary": "...", "highlights": ["..."], "blockers": ["..."] }
Keep summary to 2-4 sentences. Highlights and blockers are short bullet strings. No markdown, no prose outside JSON.`;

  const userMessage = `Project: ${project.name}
Overall task counts: total=${counts.total}, done=${counts.done}, in_progress=${counts.in_progress}, todo=${counts.todo}, blocked=${counts.blocked}

Completed this week:
${completedList}

Slipped milestones:
${slippingList}

Blockers:
${blockedList}

Draft a project status update. Choose status based on: many slipped milestones or >2 blockers => at_risk or off_track; steady progress and no blockers => on_track; all done => complete.`;

  try {
    const response = await generateAiResponse(systemPrompt, userMessage);
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "AI returned invalid format" }, { status: 502 });
    }
    const parsed = JSON.parse(match[0]) as Partial<DraftPayload>;
    const draft: DraftPayload = {
      status: (parsed.status as StatusValue) || "on_track",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((h): h is string => typeof h === "string")
        : [],
      blockers: Array.isArray(parsed.blockers)
        ? parsed.blockers.filter((b): b is string => typeof b === "string")
        : [],
    };
    return NextResponse.json(draft);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AI service error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
