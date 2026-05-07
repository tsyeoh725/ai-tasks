import { db } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { authenticateApiKey, apiUnauthorized } from "@/lib/api-auth";
import { getAccessibleProjectIds } from "@/lib/queries/projects";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  // SL-1: scope to projects this API key's user can see. Previously this
  // returned the entire `projects` table — a single key was a full DB read.
  const ids = await getAccessibleProjectIds(user.id);
  if (ids.length === 0) {
    return NextResponse.json({ data: [] });
  }
  const result = await db.query.projects.findMany({
    where: inArray(projects.id, ids),
    orderBy: [desc(projects.updatedAt)],
  });

  return NextResponse.json({ data: result });
}

export async function POST(req: Request) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const { name, description, color, team_id } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // SL-1: when team_id is supplied, the caller must be a member of that team.
  // Without this gate, any API key creates projects under any team.
  if (team_id) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, team_id), eq(teamMembers.userId, user.id)),
      columns: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of that team" }, { status: 403 });
    }
  }

  const id = uuid();
  const now = new Date();

  await db.insert(projects).values({
    id,
    name,
    description: description || null,
    color: color || "#6366f1",
    teamId: team_id || null,
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const project = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.id, id),
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
