import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, id),
    with: {
      keyResults: true,
      links: true,
      owner: { columns: { id: true, name: true } },
    },
  });

  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(goal);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const updates = await req.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.progress !== undefined) updateData.progress = updates.progress;
  if (updates.dueDate !== undefined)
    updateData.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;

  await db.update(goals).set(updateData).where(eq(goals.id, id));

  const updated = await db.query.goals.findFirst({
    where: eq(goals.id, id),
    with: {
      keyResults: true,
      links: true,
      owner: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  await db.delete(goals).where(eq(goals.id, id));
  return NextResponse.json({ success: true });
}
