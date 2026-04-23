import { db } from "@/db";
import { forms, formFields, projects, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

async function checkFormAccess(
  formId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const form = await db.query.forms.findFirst({ where: eq(forms.id, formId) });
  if (!form) return { ok: false, status: 404, error: "Form not found" };

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, form.projectId),
  });
  if (!project) return { ok: false, status: 404, error: "Project not found" };

  if (project.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, project.teamId),
        eq(teamMembers.userId, userId)
      ),
    });
    if (!membership) return { ok: false, status: 403, error: "No access" };
  } else if (project.ownerId !== userId) {
    return { ok: false, status: 403, error: "No access" };
  }

  return { ok: true };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const access = await checkFormAccess(id, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.query.formFields.findMany({
    where: eq(formFields.formId, id),
    orderBy: (ff, { asc }) => [asc(ff.position)],
  });

  return NextResponse.json({ fields: rows });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const access = await checkFormAccess(id, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await req.json();
  const { label, type, required, options, mapsTo } = body;

  if (!label || !type) {
    return NextResponse.json(
      { error: "label and type are required" },
      { status: 400 }
    );
  }

  const existing = await db.query.formFields.findMany({
    where: eq(formFields.formId, id),
  });

  const field = {
    id: uuid(),
    formId: id,
    label,
    type: type as "text" | "textarea" | "number" | "date" | "select" | "checkbox",
    required: required ?? false,
    options: options ? JSON.stringify(options) : null,
    mapsTo: mapsTo || null,
    position: existing.length,
  };

  await db.insert(formFields).values(field);

  return NextResponse.json(field, { status: 201 });
}

// PATCH — reorder fields; body: { orderedIds: string[] } OR update a single field
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const access = await checkFormAccess(id, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await req.json();

  // Reorder
  if (Array.isArray(body.orderedIds)) {
    for (let i = 0; i < body.orderedIds.length; i++) {
      await db
        .update(formFields)
        .set({ position: i })
        .where(
          and(eq(formFields.id, body.orderedIds[i]), eq(formFields.formId, id))
        );
    }
    return NextResponse.json({ success: true });
  }

  // Single field update
  if (body.fieldId) {
    const updateData: Record<string, unknown> = {};
    if (body.label !== undefined) updateData.label = body.label;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.required !== undefined) updateData.required = body.required;
    if (body.options !== undefined)
      updateData.options = body.options ? JSON.stringify(body.options) : null;
    if (body.mapsTo !== undefined) updateData.mapsTo = body.mapsTo;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    await db
      .update(formFields)
      .set(updateData)
      .where(
        and(eq(formFields.id, body.fieldId), eq(formFields.formId, id))
      );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "orderedIds or fieldId required" },
    { status: 400 }
  );
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const access = await checkFormAccess(id, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { fieldId } = await req.json();
  if (!fieldId) {
    return NextResponse.json({ error: "fieldId required" }, { status: 400 });
  }

  await db
    .delete(formFields)
    .where(and(eq(formFields.id, fieldId), eq(formFields.formId, id)));
  return NextResponse.json({ success: true });
}
