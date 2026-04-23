import { db } from "@/db";
import { forms, projects, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

async function checkFormAccess(
  formId: string,
  userId: string
): Promise<{ ok: true; form: typeof forms.$inferSelect } | { ok: false; status: number; error: string }> {
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

  return { ok: true, form };
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

  const form = await db.query.forms.findFirst({
    where: eq(forms.id, id),
    with: {
      fields: { orderBy: (ff, { asc }) => [asc(ff.position)] },
      createdBy: { columns: { id: true, name: true } },
      project: { columns: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json(form);
}

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

  const updates = await req.json();
  const updateData: Record<string, unknown> = {};
  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.update(forms).set(updateData).where(eq(forms.id, id));

  const updated = await db.query.forms.findFirst({
    where: eq(forms.id, id),
    with: {
      fields: { orderBy: (ff, { asc }) => [asc(ff.position)] },
      createdBy: { columns: { id: true, name: true } },
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
  const access = await checkFormAccess(id, user.id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  await db.delete(forms).where(eq(forms.id, id));
  return NextResponse.json({ success: true });
}
