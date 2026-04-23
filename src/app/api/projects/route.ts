import { db } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { eq, or, and, isNull, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Get teams the user belongs to
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);

  // Get personal projects + team projects
  const conditions = [
    and(eq(projects.ownerId, user.id), isNull(projects.teamId)),
  ];
  if (teamIds.length > 0) {
    conditions.push(inArray(projects.teamId, teamIds));
  }

  const result = await db.query.projects.findMany({
    where: or(...conditions),
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
  });

  return NextResponse.json({ projects: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, description, color, icon, teamId } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // If teamId provided, verify user is a member
  if (teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id)),
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a team member" }, { status: 403 });
    }
  }

  const id = uuid();
  const now = new Date();

  await db.insert(projects).values({
    id,
    name,
    description: description || null,
    color: color || "#6366f1",
    icon: icon || null,
    teamId: teamId || null,
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  return NextResponse.json(project, { status: 201 });
}
