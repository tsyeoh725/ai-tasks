import { db } from "@/db";
import { goalLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: goalId } = await params;
  const { entityType, entityId } = await req.json();

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 }
    );
  }

  const id = uuid();

  await db.insert(goalLinks).values({
    id,
    goalId,
    entityType,
    entityId,
    createdAt: new Date(),
  });

  const link = await db.query.goalLinks.findFirst({
    where: eq(goalLinks.id, id),
  });

  return NextResponse.json(link, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  await params; // consume params
  const { linkId } = await req.json();

  if (!linkId) {
    return NextResponse.json(
      { error: "linkId is required" },
      { status: 400 }
    );
  }

  await db.delete(goalLinks).where(eq(goalLinks.id, linkId));
  return NextResponse.json({ success: true });
}
