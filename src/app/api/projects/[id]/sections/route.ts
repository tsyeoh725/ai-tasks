import { db } from "@/db";
import { sections, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// List sections for a project
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const rows = await db.query.sections.findMany({
    where: eq(sections.projectId, id),
    orderBy: (s, { asc }) => [asc(s.sortOrder)],
  });

  return NextResponse.json({ sections: rows });
}

// Create a section (auto-assigns the next sortOrder)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { name } = await req.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const existing = await db.query.sections.findMany({
    where: eq(sections.projectId, id),
  });

  const section = {
    id: uuid(),
    projectId: id,
    name: name.trim(),
    sortOrder: existing.length,
    createdAt: new Date(),
  };

  await db.insert(sections).values(section);

  return NextResponse.json(section, { status: 201 });
}
