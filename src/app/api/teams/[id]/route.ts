import { db } from "@/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Check membership
  const membership = await db.query.teamMembers.findFirst({
    where: (tm, { and, eq: e }) => and(e(tm.teamId, id), e(tm.userId, user.id)),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const team = await db.query.teams.findFirst({
    where: eq(teams.id, id),
    with: {
      members: {
        with: {
          user: { columns: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ...team, role: membership.role });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Check admin/owner
  const membership = await db.query.teamMembers.findFirst({
    where: (tm, { and, eq: e }) => and(e(tm.teamId, id), e(tm.userId, user.id)),
  });

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description } = await req.json();
  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;

  await db.update(teams).set(updateData).where(eq(teams.id, id));

  const updated = await db.query.teams.findFirst({ where: eq(teams.id, id) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Only owner can delete
  const membership = await db.query.teamMembers.findFirst({
    where: (tm, { and, eq: e }) => and(e(tm.teamId, id), e(tm.userId, user.id)),
  });

  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Only the team owner can delete this team" }, { status: 403 });
  }

  await db.delete(teams).where(eq(teams.id, id));
  return NextResponse.json({ success: true });
}
