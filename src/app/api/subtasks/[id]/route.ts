import { db } from "@/db";
import { subtasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const updates = await req.json();

  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.isDone !== undefined) updateData.isDone = updates.isDone;

  await db.update(subtasks).set(updateData).where(eq(subtasks.id, id));
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  await db.delete(subtasks).where(eq(subtasks.id, id));
  return NextResponse.json({ success: true });
}
