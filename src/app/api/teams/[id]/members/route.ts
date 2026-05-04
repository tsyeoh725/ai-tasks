import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { notifyTeamMemberAdded } from "@/lib/notifications";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: teamId } = await params;

  // Check that current user is admin/owner
  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)),
  });

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Only admins can add members" }, { status: 403 });
  }

  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Find user by email
  const targetUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!targetUser) {
    return NextResponse.json({ error: "No user found with that email. They need to register first." }, { status: 404 });
  }

  // Check if already a member
  const existing = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUser.id)),
  });

  if (existing) {
    return NextResponse.json({ error: "User is already a member of this team" }, { status: 409 });
  }

  // Add member
  await db.insert(teamMembers).values({
    id: uuid(),
    teamId,
    userId: targetUser.id,
    role: "member",
    joinedAt: new Date(),
  });

  // Notify the new member so they actually find out (the team won't appear
  // in their workspace dropdown until their tab refreshes / picks up the
  // updated /api/teams response).
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (team) {
    await notifyTeamMemberAdded(
      targetUser.id,
      user.name || user.email || "A teammate",
      team.name,
      teamId,
    );
  }

  return NextResponse.json({ success: true, user: { id: targetUser.id, name: targetUser.name, email: targetUser.email } }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: teamId } = await params;

  // Check that current user is admin/owner
  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)),
  });

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });
  }

  const { memberId } = await req.json();

  if (!memberId) {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }

  // Can't remove the owner
  const target = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.id, memberId),
  });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the team owner" }, { status: 403 });
  }

  await db.delete(teamMembers).where(eq(teamMembers.id, memberId));

  return NextResponse.json({ success: true });
}
