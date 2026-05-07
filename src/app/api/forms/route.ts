import { db } from "@/db";
import { forms, formFields, projects, teamMembers } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getAccessibleProjectIds } from "@/lib/queries/projects";

// GET — list forms user has access to via accessible projects
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const projectIds = await getAccessibleProjectIds(user.id);

  if (projectIds.length === 0) {
    return NextResponse.json({ forms: [] });
  }

  const result = await db.query.forms.findMany({
    where: inArray(forms.projectId, projectIds),
    with: {
      project: { columns: { id: true, name: true, color: true } },
      createdBy: { columns: { id: true, name: true } },
    },
    orderBy: (f, { desc }) => [desc(f.createdAt)],
  });

  return NextResponse.json({ forms: result });
}

// POST — create form with initial fields[]
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { projectId, title, description, isPublic, fields } = body;

  if (!projectId || !title) {
    return NextResponse.json(
      { error: "projectId and title are required" },
      { status: 400 }
    );
  }

  // Verify user has access to the project
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, project.teamId),
        eq(teamMembers.userId, user.id)
      ),
    });
    if (!membership) {
      return NextResponse.json({ error: "No access to project" }, { status: 403 });
    }
  } else if (project.ownerId !== user.id) {
    return NextResponse.json({ error: "No access to project" }, { status: 403 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(forms).values({
    id,
    projectId,
    title,
    description: description || null,
    // SL-5: opt-in, not opt-out. Public forms are a DoS surface (no rate
    // limit on /api/forms/*/submit historically). Force the caller to pass
    // `true` explicitly.
    isPublic: isPublic === true,
    createdById: user.id,
    createdAt: now,
  });

  // Insert initial fields if provided
  if (Array.isArray(fields) && fields.length > 0) {
    const toInsert = fields.map((f, i) => ({
      id: uuid(),
      formId: id,
      label: f.label,
      type: f.type,
      required: f.required ?? false,
      options: f.options ? JSON.stringify(f.options) : null,
      mapsTo: f.mapsTo || null,
      position: f.position ?? i,
    }));
    await db.insert(formFields).values(toInsert);
  }

  const created = await db.query.forms.findFirst({
    where: eq(forms.id, id),
    with: {
      fields: { orderBy: (ff, { asc }) => [asc(ff.position)] },
      createdBy: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
