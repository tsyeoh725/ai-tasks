import { db } from "@/db";
import { taskComments, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { logActivity } from "@/lib/activity";
import { notifyTaskComment } from "@/lib/notifications";

// Get comments for a task
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id), columns: { projectId: true } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (!(await canAccessProject(task.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const comments = await db.query.taskComments.findMany({
    where: and(eq(taskComments.taskId, id), eq(taskComments.isAi, false)),
    with: { author: { columns: { id: true, name: true } } },
    orderBy: (c, { asc }) => [asc(c.createdAt)],
  });

  return NextResponse.json({ comments });
}

// Add a comment to a task
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!(await canAccessProject(task.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const comment = {
    id: uuid(),
    taskId: id,
    content: content.trim(),
    authorId: user.id!,
    isAi: false,
  };

  await db.insert(taskComments).values(comment);

  // Log activity
  await logActivity({
    entityType: "task",
    entityId: id,
    userId: user.id!,
    action: "commented",
  });

  // Notify relevant users (assignee and task creator, excluding commenter)
  const recipientIds = new Set<string>();
  if (task.assigneeId && task.assigneeId !== user.id) recipientIds.add(task.assigneeId);
  if (task.createdById && task.createdById !== user.id) recipientIds.add(task.createdById);

  if (recipientIds.size > 0) {
    await notifyTaskComment(
      Array.from(recipientIds),
      user.name!,
      task.title,
      task.id,
    );
  }

  return NextResponse.json(comment);
}
