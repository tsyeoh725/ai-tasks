import { db } from "@/db";
import { bundles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const bundle = await db.query.bundles.findFirst({
    where: eq(bundles.id, id),
    with: {
      createdBy: { columns: { id: true, name: true } },
      team: { columns: { id: true, name: true } },
    },
  });

  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(bundle);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const updates = await req.json();

  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.manifest !== undefined)
    updateData.manifest =
      typeof updates.manifest === "string"
        ? updates.manifest
        : JSON.stringify(updates.manifest);
  if (updates.teamId !== undefined) updateData.teamId = updates.teamId;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(bundles).set(updateData).where(eq(bundles.id, id));

  const updated = await db.query.bundles.findFirst({
    where: eq(bundles.id, id),
    with: {
      createdBy: { columns: { id: true, name: true } },
      team: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const bundle = await db.query.bundles.findFirst({
    where: eq(bundles.id, id),
  });

  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (bundle.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the owner can delete this bundle" },
      { status: 403 }
    );
  }

  await db.delete(bundles).where(eq(bundles.id, id));
  return NextResponse.json({ success: true });
}
