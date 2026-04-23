import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey, apiUnauthorized } from "@/lib/api-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const { id } = await params;
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: { columns: { id: true, name: true } },
      assignee: { columns: { id: true, name: true } },
      subtasks: true,
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: task });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const { id } = await params;
  const body = await req.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === "done") updateData.completedAt = new Date();
    else updateData.completedAt = null;
  }
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.assignee_id !== undefined) updateData.assigneeId = body.assignee_id || null;
  if (body.due_date !== undefined) updateData.dueDate = body.due_date ? new Date(body.due_date) : null;

  await db.update(tasks).set(updateData).where(eq(tasks.id, id));

  const updated = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: { columns: { id: true, name: true } },
      assignee: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const { id } = await params;
  await db.delete(tasks).where(eq(tasks.id, id));
  return NextResponse.json({ success: true });
}
