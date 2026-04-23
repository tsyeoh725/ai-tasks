import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { logActivity } from "@/lib/activity";
import { notifyTaskAssigned } from "@/lib/notifications";
import { autoSyncSchedule } from "@/lib/time-blocker";
import { getAccessibleProjectIds } from "@/lib/queries/projects";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const assignedToMe = searchParams.get("assignedToMe");

  // Build conditions
  const conditions = [];

  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
  } else {
    const projectIds = await getAccessibleProjectIds(user.id);
    if (projectIds.length === 0) {
      return NextResponse.json({ tasks: [] });
    }
    conditions.push(inArray(tasks.projectId, projectIds));
  }

  if (status) {
    conditions.push(eq(tasks.status, status as "todo" | "in_progress" | "done" | "blocked"));
  }

  if (assignedToMe === "true") {
    conditions.push(eq(tasks.assigneeId, user.id));
  }

  const result = await db.query.tasks.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      project: { columns: { name: true, color: true } },
      assignee: { columns: { name: true, email: true } },
      subtasks: true,
    },
    orderBy: [desc(tasks.createdAt)],
  });

  return NextResponse.json({ tasks: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { title, description, status, priority, projectId, sectionId, assigneeId, dueDate, taskType } = await req.json();

  if (!title || !projectId) {
    return NextResponse.json({ error: "Title and projectId are required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(tasks).values({
    id,
    title,
    description: description || null,
    status: status || "todo",
    priority: priority || "medium",
    projectId,
    sectionId: sectionId || null,
    assigneeId: assigneeId || null,
    createdById: user.id,
    dueDate: dueDate ? new Date(dueDate) : null,
    taskType: taskType || "task",
    createdAt: now,
    updatedAt: now,
  });

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: { columns: { name: true, color: true } },
      assignee: { columns: { name: true, email: true } },
      subtasks: true,
    },
  });

  // Log activity
  await logActivity({
    entityType: "task",
    entityId: id,
    userId: user.id!,
    action: "created",
    metadata: { title, projectId },
  });

  // Notify assignee
  if (assigneeId && assigneeId !== user.id) {
    await notifyTaskAssigned(assigneeId, user.name!, title, id);
  }

  // Trigger background schedule sync if task is assigned to someone (fire-and-forget)
  const assignedTo = assigneeId || null;
  if (assignedTo) {
    autoSyncSchedule(assignedTo).catch((err) => {
      console.error("Background auto-sync failed:", err);
    });
  }

  return NextResponse.json(task, { status: 201 });
}
