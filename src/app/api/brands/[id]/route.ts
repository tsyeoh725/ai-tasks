import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { serializeBrand } from "../route";

async function loadOwned(id: string, userId: string) {
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, id) });
  if (!brand) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (brand.userId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { brand };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { brand, error } = await loadOwned(id, user.id);
  if (error) return error;

  return NextResponse.json(brand ? serializeBrand(brand) : null);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { error } = await loadOwned(id, user.id);
  if (error) return error;

  const body = (await req.json()) as Record<string, unknown>;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updateData.name = body.name;
  if (typeof body.metaAccountId === "string") updateData.metaAccountId = body.metaAccountId;
  if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;
  if (body.config !== undefined) {
    updateData.config = typeof body.config === "string" ? body.config : JSON.stringify(body.config);
  }
  if (body.projectId === null || typeof body.projectId === "string") {
    updateData.projectId = body.projectId;
  }

  await db.update(brands).set(updateData).where(eq(brands.id, id));

  const updated = await db.query.brands.findFirst({ where: eq(brands.id, id) });
  return NextResponse.json(updated ? serializeBrand(updated) : null);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { error } = await loadOwned(id, user.id);
  if (error) return error;

  // Cascade deletes are defined on the schema (campaigns, adSets, ads, journal, memory).
  await db.delete(brands).where(eq(brands.id, id));
  return NextResponse.json({ success: true });
}
