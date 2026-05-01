import { db } from "@/db";
import { bundles, teamMembers } from "@/db/schema";
import { eq, or, inArray, isNull } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Show bundles the user created or bundles belonging to their teams
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);

  const conditions = [eq(bundles.createdById, user.id), isNull(bundles.teamId)];
  if (teamIds.length > 0) {
    conditions.push(inArray(bundles.teamId, teamIds));
  }

  const result = await db.query.bundles.findMany({
    where: or(...conditions),
    with: {
      createdBy: { columns: { id: true, name: true } },
      team: { columns: { id: true, name: true } },
    },
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  return NextResponse.json({ bundles: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { name, description, manifest, teamId } = body;

  if (!name || !manifest) {
    return NextResponse.json(
      { error: "name and manifest are required" },
      { status: 400 }
    );
  }

  const id = uuid();
  const now = new Date();

  await db.insert(bundles).values({
    id,
    name,
    description: description || null,
    manifest:
      typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    createdById: user.id,
    teamId: teamId || null,
    createdAt: now,
  });

  const created = await db.query.bundles.findFirst({
    where: eq(bundles.id, id),
    with: {
      createdBy: { columns: { id: true, name: true } },
      team: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
