import { db } from "@/db";
import { projectStatuses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { canAccessProject } from "@/lib/access";

// PATCH /api/projects/[id]/statuses/[statusId]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id, statusId } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, color, sortOrder, isDefault, isFinal } = await req.json();

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (isDefault !== undefined) updates.isDefault = isDefault;
  if (isFinal !== undefined) updates.isFinal = isFinal;

  await db.update(projectStatuses)
    .set(updates)
    .where(and(eq(projectStatuses.id, statusId), eq(projectStatuses.projectId, id)));

  const status = await db.query.projectStatuses.findFirst({ where: eq(projectStatuses.id, statusId) });
  return NextResponse.json(status);
}

// DELETE /api/projects/[id]/statuses/[statusId]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; statusId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id, statusId } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = await db.query.projectStatuses.findFirst({
    where: and(eq(projectStatuses.id, statusId), eq(projectStatuses.projectId, id)),
  });

  if (!status) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status.isDefault) return NextResponse.json({ error: "Cannot delete default status" }, { status: 400 });

  await db.delete(projectStatuses)
    .where(and(eq(projectStatuses.id, statusId), eq(projectStatuses.projectId, id)));

  return NextResponse.json({ success: true });
}
