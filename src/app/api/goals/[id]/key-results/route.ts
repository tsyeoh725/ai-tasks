import { db } from "@/db";
import { keyResults, goals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

async function recalculateGoalProgress(goalId: string) {
  const allKRs = await db.query.keyResults.findMany({
    where: eq(keyResults.goalId, goalId),
  });

  if (allKRs.length === 0) return;

  const avgProgress =
    allKRs.reduce((sum, kr) => {
      const pct = kr.targetValue > 0 ? (kr.currentValue / kr.targetValue) * 100 : 0;
      return sum + pct;
    }, 0) / allKRs.length;

  await db
    .update(goals)
    .set({ progress: Math.round(avgProgress), updatedAt: new Date() })
    .where(eq(goals.id, goalId));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: goalId } = await params;
  const { title, targetValue, unit } = await req.json();

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(keyResults).values({
    id,
    goalId,
    title,
    targetValue: targetValue ?? 100,
    currentValue: 0,
    unit: unit || "%",
    createdAt: now,
    updatedAt: now,
  });

  await recalculateGoalProgress(goalId);

  const kr = await db.query.keyResults.findFirst({
    where: eq(keyResults.id, id),
  });

  return NextResponse.json(kr, { status: 201 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: goalId } = await params;
  const { keyResultId, currentValue, title, targetValue } = await req.json();

  if (!keyResultId) {
    return NextResponse.json(
      { error: "keyResultId is required" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (currentValue !== undefined) updateData.currentValue = currentValue;
  if (title !== undefined) updateData.title = title;
  if (targetValue !== undefined) updateData.targetValue = targetValue;

  await db
    .update(keyResults)
    .set(updateData)
    .where(eq(keyResults.id, keyResultId));

  await recalculateGoalProgress(goalId);

  const updated = await db.query.keyResults.findFirst({
    where: eq(keyResults.id, keyResultId),
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: goalId } = await params;
  const { keyResultId } = await req.json();

  if (!keyResultId) {
    return NextResponse.json(
      { error: "keyResultId is required" },
      { status: 400 }
    );
  }

  await db.delete(keyResults).where(eq(keyResults.id, keyResultId));
  await recalculateGoalProgress(goalId);

  return NextResponse.json({ success: true });
}
