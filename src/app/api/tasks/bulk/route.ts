import { db } from "@/db";
import { tasks } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";

// Bulk update tasks
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { taskIds, updates } = await req.json();

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: "taskIds array required" }, { status: 400 });
  }

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "updates object required" }, { status: 400 });
  }

  // Verify user has access to all affected tasks' projects
  const affectedTasks = await db.query.tasks.findMany({
    where: inArray(tasks.id, taskIds),
    columns: { id: true, projectId: true },
  });

  const projectIds = [...new Set(affectedTasks.map((t) => t.projectId))];
  for (const projectId of projectIds) {
    if (!(await canAccessProject(projectId, user.id!))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.status !== undefined) {
    updateData.status = updates.status;
    if (updates.status === "done") updateData.completedAt = new Date();
    else updateData.completedAt = null;
  }
  if (updates.priority !== undefined) updateData.priority = updates.priority;
  if (updates.assigneeId !== undefined) updateData.assigneeId = updates.assigneeId || null;

  await db.update(tasks).set(updateData).where(inArray(tasks.id, taskIds));

  // Log activity for each task
  for (const taskId of taskIds) {
    for (const [field, value] of Object.entries(updates)) {
      await logActivity({
        entityType: "task",
        entityId: taskId,
        userId: user.id!,
        action: field === "status" ? "moved" : "updated",
        field,
        newValue: value != null ? String(value) : null,
      });
    }
  }

  return NextResponse.json({ success: true, updated: taskIds.length });
}

// Bulk delete tasks
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { taskIds } = await req.json();

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ error: "taskIds array required" }, { status: 400 });
  }

  const doomed = await db.query.tasks.findMany({
    where: inArray(tasks.id, taskIds),
    columns: { id: true, title: true, projectId: true },
  });

  // Verify user has access to all affected tasks' projects
  const projectIds = [...new Set(doomed.map((t) => t.projectId))];
  for (const projectId of projectIds) {
    if (!(await canAccessProject(projectId, user.id!))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await db.delete(tasks).where(inArray(tasks.id, taskIds));

  for (const t of doomed) {
    await logActivity({
      entityType: "task",
      entityId: t.id,
      userId: user.id!,
      action: "deleted",
      oldValue: t.title,
    });
  }

  return NextResponse.json({ success: true, deleted: doomed.length });
}
