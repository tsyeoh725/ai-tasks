import { db } from "@/db";
import { customFieldValues } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// Get custom field values for a task
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const values = await db.query.customFieldValues.findMany({
    where: eq(customFieldValues.taskId, id),
    with: { field: true },
  });

  return NextResponse.json({ values });
}

// Set a custom field value
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { fieldId, value } = await req.json();

  if (!fieldId) {
    return NextResponse.json({ error: "fieldId required" }, { status: 400 });
  }

  // Upsert: check if value exists
  const existing = await db.query.customFieldValues.findFirst({
    where: and(
      eq(customFieldValues.taskId, id),
      eq(customFieldValues.fieldId, fieldId),
    ),
  });

  if (existing) {
    await db
      .update(customFieldValues)
      .set({ value: value ?? null, updatedAt: new Date() })
      .where(eq(customFieldValues.id, existing.id));
    return NextResponse.json({ ...existing, value });
  } else {
    const newValue = {
      id: uuid(),
      taskId: id,
      fieldId,
      value: value ?? null,
    };
    await db.insert(customFieldValues).values(newValue);
    return NextResponse.json(newValue, { status: 201 });
  }
}
