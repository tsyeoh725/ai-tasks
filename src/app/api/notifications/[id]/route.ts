import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};

  if (body.archived === true) {
    updates.archivedAt = new Date();
  } else if (body.archived === false) {
    updates.archivedAt = null;
  }

  if (body.snoozedUntil !== undefined) {
    updates.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  }

  if (body.read !== undefined) {
    updates.read = body.read === true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  await db
    .update(notifications)
    .set(updates)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id!)));

  const updated = await db.query.notifications.findFirst({
    where: and(eq(notifications.id, id), eq(notifications.userId, user.id!)),
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id!)));

  return NextResponse.json({ success: true });
}
