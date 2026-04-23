import { db } from "@/db";
import { customFieldDefinitions, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// List custom field definitions for a project
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const fields = await db.query.customFieldDefinitions.findMany({
    where: eq(customFieldDefinitions.projectId, id),
    orderBy: (f, { asc }) => [asc(f.position)],
  });

  return NextResponse.json({ fields });
}

// Create a custom field definition
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { name, type, options, required } = await req.json();

  if (!name || !type) {
    return NextResponse.json({ error: "name and type required" }, { status: 400 });
  }

  // Verify project exists
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get next position
  const existing = await db.query.customFieldDefinitions.findMany({
    where: eq(customFieldDefinitions.projectId, id),
  });

  const field = {
    id: uuid(),
    projectId: id,
    name,
    type,
    options: options ? JSON.stringify(options) : null,
    required: required || false,
    position: existing.length,
  };

  await db.insert(customFieldDefinitions).values(field);

  return NextResponse.json(field, { status: 201 });
}

// Update a custom field definition
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { fieldId, name, options, required } = await req.json();

  if (!fieldId) {
    return NextResponse.json({ error: "fieldId required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (options !== undefined) updateData.options = JSON.stringify(options);
  if (required !== undefined) updateData.required = required;

  await db.update(customFieldDefinitions).set(updateData).where(eq(customFieldDefinitions.id, fieldId));

  return NextResponse.json({ success: true });
}

// Delete a custom field definition
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { fieldId } = await req.json();

  if (!fieldId) {
    return NextResponse.json({ error: "fieldId required" }, { status: 400 });
  }

  await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, fieldId));

  return NextResponse.json({ success: true });
}
