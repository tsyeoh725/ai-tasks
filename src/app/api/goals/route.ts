import { db } from "@/db";
import { goals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const result = await db.query.goals.findMany({
    where: eq(goals.ownerId, user.id),
    with: {
      keyResults: true,
      links: true,
      owner: { columns: { id: true, name: true } },
    },
    orderBy: (g, { desc }) => [desc(g.createdAt)],
  });

  return NextResponse.json({ goals: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { title, description, type, status, teamId, parentGoalId, dueDate, startDate,
    specific, measurable, achievable, relevant, timeBound } = await req.json();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(goals).values({
    id,
    title,
    description: description || null,
    type: type || "goal",
    status: status || "not_started",
    progress: 0,
    ownerId: user.id,
    teamId: teamId || null,
    parentGoalId: parentGoalId || null,
    startDate: startDate ? new Date(startDate) : null,
    dueDate: dueDate ? new Date(dueDate) : null,
    specific: specific || null,
    measurable: measurable || null,
    achievable: achievable || null,
    relevant: relevant || null,
    timeBound: timeBound || null,
    reminders: "[]",
    createdAt: now,
    updatedAt: now,
  });

  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, id),
    with: {
      keyResults: true,
      links: true,
      owner: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
