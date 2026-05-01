import { db } from "@/db";
import { automationRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const updates = await req.json();

  const existing = await db.query.automationRules.findFirst({
    where: eq(automationRules.id, id),
  });

  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.trigger !== undefined) updateData.trigger = JSON.stringify(updates.trigger);
  if (updates.actions !== undefined) updateData.actions = JSON.stringify(updates.actions);
  if (updates.enabled !== undefined) updateData.enabled = updates.enabled;

  await db.update(automationRules).set(updateData).where(eq(automationRules.id, id));

  const updated = await db.query.automationRules.findFirst({
    where: eq(automationRules.id, id),
  });

  return NextResponse.json({
    ...updated,
    trigger: JSON.parse(updated!.trigger),
    actions: JSON.parse(updated!.actions),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.automationRules.findFirst({
    where: eq(automationRules.id, id),
  });

  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await db.delete(automationRules).where(eq(automationRules.id, id));

  return NextResponse.json({ success: true });
}
