import { db } from "@/db";
import { sections, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const section = await db.query.sections.findFirst({ where: eq(sections.id, id) });
  if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  if (!(await canAccessProject(section.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { name, sortOrder } = body as { name?: string; sortOrder?: number | string };

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    updateData.name = name.trim();
  }
  if (sortOrder !== undefined) {
    updateData.sortOrder = Number(sortOrder);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(sections).set(updateData).where(eq(sections.id, id));
  const updated = await db.query.sections.findFirst({ where: eq(sections.id, id) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const section = await db.query.sections.findFirst({ where: eq(sections.id, id) });
  if (!section) return NextResponse.json({ error: "Section not found" }, { status: 404 });
  if (!(await canAccessProject(section.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Detach tasks: set their sectionId to null (keep the parent project).
  await db.update(tasks).set({ sectionId: null }).where(eq(tasks.sectionId, id));

  await db.delete(sections).where(eq(sections.id, id));
  return NextResponse.json({ success: true });
}
