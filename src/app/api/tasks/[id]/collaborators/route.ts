import { db } from "@/db";
import { taskCollaborators, users, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { createNotification } from "@/lib/notifications";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const collaborators = await db
    .select({
      id: taskCollaborators.id,
      role: taskCollaborators.role,
      addedAt: taskCollaborators.addedAt,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(taskCollaborators)
    .innerJoin(users, eq(taskCollaborators.userId, users.id))
    .where(eq(taskCollaborators.taskId, id));

  return NextResponse.json({ collaborators });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  const { userId, role } = body;

  if (!userId || !role) {
    return NextResponse.json(
      { error: "userId and role are required" },
      { status: 400 }
    );
  }

  // Check if already a collaborator
  const existing = await db
    .select()
    .from(taskCollaborators)
    .where(
      and(
        eq(taskCollaborators.taskId, id),
        eq(taskCollaborators.userId, userId)
      )
    );

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "User is already a collaborator" },
      { status: 409 }
    );
  }

  const collaboratorId = uuid();
  await db.insert(taskCollaborators).values({
    id: collaboratorId,
    taskId: id,
    userId,
    role,
  });

  // Notify the added collaborator
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    columns: { title: true },
  });

  if (task && userId !== user.id) {
    await createNotification({
      userId,
      type: "assigned",
      title: `${user.name} added you as ${role} on "${task.title}"`,
      entityType: "task",
      entityId: id,
    });
  }

  return NextResponse.json({ id: collaboratorId }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { collaboratorId } = body;

  if (!collaboratorId) {
    return NextResponse.json(
      { error: "collaboratorId is required" },
      { status: 400 }
    );
  }

  await db
    .delete(taskCollaborators)
    .where(eq(taskCollaborators.id, collaboratorId));

  return NextResponse.json({ success: true });
}
