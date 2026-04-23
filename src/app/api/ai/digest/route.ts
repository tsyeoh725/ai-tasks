import { db } from "@/db";
import { tasks, projects, teamMembers } from "@/db/schema";
import { eq, and, or, isNull, inArray, ne } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { generateAiResponse } from "@/lib/ai";
import { NextResponse } from "next/server";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Get accessible projects
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);

  const projectConditions = [
    and(eq(projects.ownerId, user.id), isNull(projects.teamId)),
  ];
  if (teamIds.length > 0) {
    projectConditions.push(inArray(projects.teamId, teamIds));
  }

  const accessibleProjects = await db.query.projects.findMany({
    where: or(...projectConditions),
    columns: { id: true, name: true },
  });
  const projectIds = accessibleProjects.map((p) => p.id);

  if (projectIds.length === 0) {
    return NextResponse.json({ summary: "You have no projects yet. Create a project to get started!" });
  }

  // Get all active tasks
  const allTasks = await db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, projectIds),
      ne(tasks.status, "done"),
    ),
    with: {
      project: { columns: { name: true } },
    },
  });

  if (allTasks.length === 0) {
    return NextResponse.json({ summary: "All caught up! No active tasks." });
  }

  const today = new Date().toLocaleDateString();
  const taskList = allTasks.map((t) => {
    return `- [${t.status}] [${t.priority}] "${t.title}" (Project: ${t.project.name}${t.dueDate ? `, Due: ${new Date(t.dueDate).toLocaleDateString()}` : ""})`;
  }).join("\n");

  const systemPrompt = `You are a productivity assistant. Generate a concise daily digest for the user.
Today is ${today}. Be brief and actionable — no more than 200 words.
Highlight: overdue tasks, urgent items, and suggest a focus order for today.`;

  const userMessage = `Here are my current tasks:\n${taskList}\n\nGive me my daily briefing.`;

  try {
    const summary = await generateAiResponse(systemPrompt, userMessage);
    return NextResponse.json({ summary });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AI service error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
