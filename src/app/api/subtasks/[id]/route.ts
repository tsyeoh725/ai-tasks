import { db } from "@/db";
import { subtasks, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";

async function ensureAccess(subtaskId: string, userId: string) {
  const sub = await db.query.subtasks.findFirst({ where: eq(subtasks.id, subtaskId) });
  if (!sub) return { ok: false, status: 404, error: "Subtask not found" } as const;
  const parent = await db.query.tasks.findFirst({ where: eq(tasks.id, sub.taskId), columns: { projectId: true } });
  if (!parent) return { ok: false, status: 404, error: "Parent task not found" } as const;
  if (!(await canAccessProject(parent.projectId, userId))) {
    return { ok: false, status: 403, error: "Forbidden" } as const;
  }
  return { ok: true } as const;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const access = await ensureAccess(id, user.id!);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let updates: Record<string, unknown>;
  try { updates = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.isDone !== undefined) updateData.isDone = !!updates.isDone;

  await db.update(subtasks).set(updateData).where(eq(subtasks.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const access = await ensureAccess(id, user.id!);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await db.delete(subtasks).where(eq(subtasks.id, id));
  return NextResponse.json({ success: true });
}
