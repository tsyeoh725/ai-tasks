import { db } from "@/db";
import { labels, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

async function canManageLabel(labelId: string, userId: string): Promise<boolean> {
  const label = await db.query.labels.findFirst({ where: eq(labels.id, labelId) });
  if (!label) return false;
  if (!label.teamId) return true; // personal label — anyone can manage
  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, label.teamId), eq(teamMembers.userId, userId)),
    columns: { role: true },
  });
  return !!membership && (membership.role === "owner" || membership.role === "admin");
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canManageLabel(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, color } = await req.json();
  const updates: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof color === "string") updates.color = color;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  await db.update(labels).set(updates).where(eq(labels.id, id));
  const updated = await db.query.labels.findFirst({ where: eq(labels.id, id) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canManageLabel(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(labels).where(eq(labels.id, id));
  return NextResponse.json({ success: true });
}
