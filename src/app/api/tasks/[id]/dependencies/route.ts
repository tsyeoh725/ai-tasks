import { db } from "@/db";
import { taskDependencies, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { logActivity } from "@/lib/activity";

// Get dependencies for a task
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Get tasks this task is blocked by
  const blockedBy = await db.query.taskDependencies.findMany({
    where: eq(taskDependencies.dependentTaskId, id),
    with: {
      dependencyTask: { columns: { id: true, title: true, status: true } },
    },
  });

  // Get tasks this task is blocking
  const blocking = await db.query.taskDependencies.findMany({
    where: eq(taskDependencies.dependencyTaskId, id),
    with: {
      dependentTask: { columns: { id: true, title: true, status: true } },
    },
  });

  return NextResponse.json({ blockedBy, blocking });
}

// Add a dependency
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { dependencyTaskId, type } = await req.json();

  if (!dependencyTaskId) {
    return NextResponse.json({ error: "dependencyTaskId required" }, { status: 400 });
  }

  if (dependencyTaskId === id) {
    return NextResponse.json({ error: "A task cannot depend on itself" }, { status: 400 });
  }

  // Check both tasks exist
  const [task1, task2] = await Promise.all([
    db.query.tasks.findFirst({ where: eq(tasks.id, id) }),
    db.query.tasks.findFirst({ where: eq(tasks.id, dependencyTaskId) }),
  ]);

  if (!task1 || !task2) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Check for duplicate
  const existing = await db.query.taskDependencies.findFirst({
    where: and(
      eq(taskDependencies.dependentTaskId, id),
      eq(taskDependencies.dependencyTaskId, dependencyTaskId),
    ),
  });

  if (existing) {
    return NextResponse.json({ error: "Dependency already exists" }, { status: 409 });
  }

  const dep = {
    id: uuid(),
    dependentTaskId: id,
    dependencyTaskId,
    type: type || "blocked_by",
  };

  await db.insert(taskDependencies).values(dep);

  await logActivity({
    entityType: "task",
    entityId: id,
    userId: user.id!,
    action: "updated",
    field: "dependency",
    newValue: `blocked by ${task2.title}`,
  });

  return NextResponse.json(dep, { status: 201 });
}

// Remove a dependency
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  await params;
  const { dependencyId } = await req.json();

  if (!dependencyId) {
    return NextResponse.json({ error: "dependencyId required" }, { status: 400 });
  }

  await db.delete(taskDependencies).where(eq(taskDependencies.id, dependencyId));

  return NextResponse.json({ success: true });
}
