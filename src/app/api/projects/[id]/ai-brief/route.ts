import { db } from "@/db";
import { goals, goalLinks, projects, tasks, teamMembers, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { generateAiResponse } from "@/lib/ai";
import { NextResponse } from "next/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Tasks
  const projectTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, id),
    columns: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      isMilestone: true,
      taskType: true,
    },
    orderBy: (t, { asc }) => [asc(t.dueDate)],
    limit: 50,
  });

  const milestones = projectTasks.filter(
    (t) => t.isMilestone || t.taskType === "milestone",
  );

  // Stakeholders — team members if team project, else owner only
  const stakeholderNames: string[] = [];
  if (project.teamId) {
    const members = await db.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, project.teamId),
      with: { user: { columns: { id: true, name: true, email: true } } },
    });
    for (const m of members) stakeholderNames.push(`${m.user.name} (${m.role})`);
  } else {
    const owner = await db.query.users.findFirst({
      where: eq(users.id, project.ownerId),
      columns: { name: true, email: true },
    });
    if (owner) stakeholderNames.push(`${owner.name} (owner)`);
  }

  // Linked goals via goalLinks
  const linkedGoalRows = await db.query.goalLinks.findMany({
    where: and(eq(goalLinks.entityType, "project"), eq(goalLinks.entityId, id)),
  });
  const goalIds = linkedGoalRows.map((g) => g.goalId);
  const linkedGoals = goalIds.length
    ? await db.query.goals.findMany({
        where: inArray(goals.id, goalIds),
        columns: { id: true, title: true, status: true, progress: true },
      })
    : [];

  const taskList = projectTasks
    .map(
      (t) =>
        `- ${t.title} [status: ${t.status}, priority: ${t.priority}${t.dueDate ? `, due ${new Date(t.dueDate).toLocaleDateString()}` : ""}]`,
    )
    .join("\n") || "(no tasks yet)";
  const milestoneList = milestones
    .map(
      (m) =>
        `- ${m.title}${m.dueDate ? ` (due ${new Date(m.dueDate).toLocaleDateString()}, status ${m.status})` : ""}`,
    )
    .join("\n") || "(no milestones)";
  const goalList = linkedGoals
    .map((g) => `- ${g.title} (${g.status}, ${g.progress}%)`)
    .join("\n") || "(no linked goals)";
  const stakeholderList = stakeholderNames.join(", ") || "(none)";

  const systemPrompt = `You are a writer drafting a project brief in Markdown. Produce concise, executive-ready prose. Use these exact section headers in order:
## Overview
## Goals
## Key Milestones
## Stakeholders
## Risks

Return ONLY the Markdown brief — no preamble, no code fences.`;

  const userMessage = `Project name: ${project.name}
Description: ${project.description || "(none)"}

Tasks (${projectTasks.length}):
${taskList}

Milestones:
${milestoneList}

Linked goals:
${goalList}

Stakeholders: ${stakeholderList}

Write the brief.`;

  try {
    const content = await generateAiResponse(systemPrompt, userMessage);
    return NextResponse.json({ content });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AI service error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
