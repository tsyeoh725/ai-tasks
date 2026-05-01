import { db } from "@/db";
import { labels, teamMembers } from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");

  // Return personal labels + labels belonging to user's teams
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id!),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);

  const conditions = [isNull(labels.teamId)];
  if (teamId) {
    conditions.push(eq(labels.teamId, teamId));
  } else if (teamIds.length > 0) {
    for (const tid of teamIds) conditions.push(eq(labels.teamId, tid));
  }

  const result = await db.query.labels.findMany({
    where: or(...conditions),
  });

  return NextResponse.json({ labels: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, color, teamId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  if (teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, user.id!)),
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = uuid();
  await db.insert(labels).values({ id, name: name.trim(), color: color || "#8b5cf6", teamId: teamId || null });

  const label = await db.query.labels.findFirst({ where: eq(labels.id, id) });
  return NextResponse.json(label, { status: 201 });
}
