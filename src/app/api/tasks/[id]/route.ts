import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";
import { logActivity, logTaskUpdates } from "@/lib/activity";
import { notifyTaskAssigned } from "@/lib/notifications";
import { createNextRecurrence } from "@/lib/recurrence";
import { evaluateRules } from "@/lib/automation";
import { autoSyncSchedule } from "@/lib/time-blocker";
import { evaluateChainsForTask } from "@/lib/workflow-chains";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: true,
      assignee: { columns: { id: true, name: true, email: true } },
      createdBy: { columns: { id: true, name: true } },
      subtasks: { orderBy: (s, { asc }) => [asc(s.sortOrder)] },
      comments: {
        with: { author: { columns: { id: true, name: true } } },
        orderBy: (c, { asc }) => [asc(c.createdAt)],
      },
      labels: { with: { label: true } },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!(await canAccessProject(task.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(task);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let updates: Record<string, unknown>;
  try { updates = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!(await canAccessProject(existing.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) {
    updateData.status = updates.status;
    if (updates.status === "done") updateData.completedAt = new Date();
    else updateData.completedAt = null;
  }
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.assigneeId !== undefined) updateData.assigneeId = updates.assigneeId || null;
  if (updates.dueDate !== undefined) {
    const dd = updates.dueDate;
    updateData.dueDate = dd && (typeof dd === "string" || typeof dd === "number" || dd instanceof Date)
      ? new Date(dd)
      : null;
  }
  if (updates.estimatedHours !== undefined) {
    updateData.estimatedHours = updates.estimatedHours === null ? null : Number(updates.estimatedHours);
  }
  if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;
  if (updates.projectId !== undefined) updateData.projectId = updates.projectId;
  if (updates.clientId !== undefined) updateData.clientId = updates.clientId || null;
  if (updates.sectionId !== undefined) updateData.sectionId = updates.sectionId || null;
  if (updates.taskType !== undefined) updateData.taskType = updates.taskType;
  if (updates.recurrenceRule !== undefined) updateData.recurrenceRule = updates.recurrenceRule ? JSON.stringify(updates.recurrenceRule) : null;
  if (updates.statusId !== undefined) updateData.statusId = updates.statusId || null;

  await db.update(tasks).set(updateData).where(eq(tasks.id, id));

  // Handle recurrence: when a recurring task is completed, create the next instance
  if (updates.status === "done" && existing.recurrenceRule) {
    await createNextRecurrence(id);
  }

  // Advance any workflow chains waiting on this task
  if (updates.status === "done" && existing.status !== "done") {
    evaluateChainsForTask(id, user.id!).catch(() => {});
  }

  // Log activity for all changed fields
  await logTaskUpdates(id, user.id!, existing as Record<string, unknown>, updates);

  // Notify assignee if task was assigned to someone new
  if (typeof updates.assigneeId === "string" && updates.assigneeId && updates.assigneeId !== existing.assigneeId && updates.assigneeId !== user.id) {
    await notifyTaskAssigned(updates.assigneeId, user.name!, existing.title, id);
  }

  // Evaluate automation rules
  if (typeof updates.status === "string" && updates.status !== existing.status) {
    await evaluateRules(existing.projectId, { type: "status_changed", taskId: id, data: { fromStatus: existing.status, toStatus: updates.status } });
  }
  if (typeof updates.priority === "string" && updates.priority !== existing.priority) {
    await evaluateRules(existing.projectId, { type: "priority_changed", taskId: id, data: { fromPriority: existing.priority, toPriority: updates.priority } });
  }
  if (updates.assigneeId !== undefined && updates.assigneeId !== existing.assigneeId) {
    await evaluateRules(existing.projectId, { type: "assigned", taskId: id, data: { assigneeId: typeof updates.assigneeId === "string" ? updates.assigneeId : "" } });
  }

  const updated = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: { columns: { name: true, color: true } },
      assignee: { columns: { name: true, email: true } },
      subtasks: true,
    },
  });

  // Trigger background schedule sync for affected assignee(s) when scheduling-relevant fields change
  const scheduleRelevant =
    updates.dueDate !== undefined ||
    updates.estimatedHours !== undefined ||
    updates.assigneeId !== undefined ||
    updates.status !== undefined ||
    updates.priority !== undefined;
  if (scheduleRelevant) {
    const assigneesToSync = new Set<string>();
    if (existing.assigneeId) assigneesToSync.add(existing.assigneeId);
    if (updated?.assigneeId) assigneesToSync.add(updated.assigneeId);
    for (const uid of assigneesToSync) {
      autoSyncSchedule(uid).catch((err) => {
        console.error("Background auto-sync failed for user", uid, err);
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!(await canAccessProject(existing.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(tasks).where(eq(tasks.id, id));
  await logActivity({
    entityType: "task",
    entityId: id,
    userId: user.id!,
    action: "deleted",
    oldValue: existing.title,
  });
  return NextResponse.json({ success: true });
}
