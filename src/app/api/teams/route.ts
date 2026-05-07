import { db } from "@/db";
import { teams, teamMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // F-13: don't echo every team member's full email in the list response.
  // Name + id is enough for avatar/badge rendering; the detail panel can
  // fetch contact info on click.
  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          members: {
            with: { user: { columns: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const result = memberships.map((m) => ({
    ...m.team,
    role: m.role,
  }));

  return NextResponse.json({ teams: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, description } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const teamId = uuid();
  const now = new Date();

  await db.insert(teams).values({
    id: teamId,
    name,
    description: description || null,
    ownerId: user.id,
    createdAt: now,
  });

  // Add creator as owner
  await db.insert(teamMembers).values({
    id: uuid(),
    teamId,
    userId: user.id,
    role: "owner",
    joinedAt: now,
  });

  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  return NextResponse.json(team, { status: 201 });
}
