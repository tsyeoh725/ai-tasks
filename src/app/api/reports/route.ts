import { db } from "@/db";
import { reports, teamMembers } from "@/db/schema";
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

  // Personal reports + team reports
  const conditions = [
    and(eq(reports.ownerId, user.id), isNull(reports.teamId)),
  ];
  if (teamIds.length > 0) {
    conditions.push(inArray(reports.teamId, teamIds));
  }

  const result = await db.query.reports.findMany({
    where: or(...conditions),
    orderBy: (r, { desc }) => [desc(r.updatedAt)],
  });

  return NextResponse.json({ reports: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, description, teamId, layout } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  const layoutString =
    layout === undefined || layout === null
      ? "[]"
      : typeof layout === "string"
        ? layout
        : JSON.stringify(layout);

  await db.insert(reports).values({
    id,
    name,
    description: description || null,
    ownerId: user.id,
    teamId: teamId || null,
    layout: layoutString,
    createdAt: now,
    updatedAt: now,
  });

  const report = await db.query.reports.findFirst({
    where: eq(reports.id, id),
  });

  return NextResponse.json(report, { status: 201 });
}
