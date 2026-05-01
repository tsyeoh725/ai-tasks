import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: teamId, userId: targetUserId } = await params;

  // Only team owner or admin can change roles
  const requester = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id!)),
    columns: { role: true },
  });

  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId), columns: { ownerId: true } });

  const isOwner = team?.ownerId === user.id;
  const isAdmin = requester?.role === "admin" || requester?.role === "owner";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { role } = await req.json();
  if (!["admin", "member"].includes(role)) {
    return NextResponse.json({ error: "Role must be admin or member" }, { status: 400 });
  }

  // Cannot demote the team owner
  if (targetUserId === team?.ownerId) {
    return NextResponse.json({ error: "Cannot change the team owner's role" }, { status: 400 });
  }

  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)),
  });

  if (!membership) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await db.update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)));

  return NextResponse.json({ success: true });
}
