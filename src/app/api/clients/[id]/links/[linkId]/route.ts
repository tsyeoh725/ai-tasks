import { db } from "@/db";
import { clientLinks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, linkId } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  ["platform", "label", "url"].forEach((k) => { if (body[k] !== undefined) updates[k] = body[k]; });
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0;

  await db.update(clientLinks)
    .set(updates)
    .where(and(eq(clientLinks.id, linkId), eq(clientLinks.clientId, id)));
  const updated = await db.query.clientLinks.findFirst({ where: eq(clientLinks.id, linkId) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, linkId } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(clientLinks)
    .where(and(eq(clientLinks.id, linkId), eq(clientLinks.clientId, id)));
  return NextResponse.json({ success: true });
}
