import { db } from "@/db";
import { taskReactions, tasks } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// List reactions for a task
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const rows = await db.query.taskReactions.findMany({
    where: eq(taskReactions.taskId, id),
    with: {
      user: { columns: { id: true, name: true } },
    },
    orderBy: (r, { asc }) => [asc(r.createdAt)],
  });

  return NextResponse.json({ reactions: rows });
}

// Toggle a reaction: if the same user already reacted to this task with the same emoji, remove it. Else insert.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { emoji } = await req.json();

  if (!emoji || typeof emoji !== "string") {
    return NextResponse.json({ error: "emoji required" }, { status: 400 });
  }

  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const existing = await db.query.taskReactions.findFirst({
    where: and(
      eq(taskReactions.taskId, id),
      eq(taskReactions.userId, user.id!),
      eq(taskReactions.emoji, emoji),
    ),
  });

  if (existing) {
    await db.delete(taskReactions).where(eq(taskReactions.id, existing.id));
    return NextResponse.json({ toggled: "removed" });
  }

  const reaction = {
    id: uuid(),
    taskId: id,
    commentId: null,
    userId: user.id!,
    emoji,
    createdAt: new Date(),
  };

  await db.insert(taskReactions).values(reaction);
  return NextResponse.json({ toggled: "added", reaction }, { status: 201 });
}
