import { db } from "@/db";
import { templates, projects, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const template = await db.query.templates.findFirst({
    where: eq(templates.id, id),
    with: {
      createdBy: {
        columns: { id: true, name: true },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const updates = await req.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined)
    updateData.description = updates.description;
  if (updates.type !== undefined) updateData.type = updates.type;
  if (updates.content !== undefined)
    updateData.content =
      typeof updates.content === "string"
        ? updates.content
        : JSON.stringify(updates.content);
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.isPublic !== undefined) updateData.isPublic = updates.isPublic;

  await db.update(templates).set(updateData).where(eq(templates.id, id));

  const updated = await db.query.templates.findFirst({
    where: eq(templates.id, id),
    with: {
      createdBy: {
        columns: { id: true, name: true },
      },
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

  const template = await db.query.templates.findFirst({
    where: eq(templates.id, id),
  });

  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (template.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the owner can delete this template" },
      { status: 403 }
    );
  }

  await db.delete(templates).where(eq(templates.id, id));
  return NextResponse.json({ success: true });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const template = await db.query.templates.findFirst({
    where: eq(templates.id, id),
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = await req.json();
  const content =
    typeof template.content === "string"
      ? JSON.parse(template.content)
      : template.content;

  if (template.type === "project") {
    const projectName = body.name || content.name || template.name;
    const projectId = uuid();
    const now = new Date();

    await db.insert(projects).values({
      id: projectId,
      name: projectName,
      description: content.description || null,
      color: content.color || "#6366f1",
      teamId: body.teamId || null,
      ownerId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    if (Array.isArray(content.tasks)) {
      for (let i = 0; i < content.tasks.length; i++) {
        const t = content.tasks[i];
        await db.insert(tasks).values({
          id: uuid(),
          title: t.title,
          description: t.description || null,
          status: t.status || "todo",
          priority: t.priority || "medium",
          projectId,
          createdById: user.id,
          assigneeId: null,
          sortOrder: i,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    return NextResponse.json(
      { type: "project", project },
      { status: 201 }
    );
  }

  if (template.type === "task") {
    const { projectId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required for task templates" },
        { status: 400 }
      );
    }

    const taskId = uuid();
    const now = new Date();

    await db.insert(tasks).values({
      id: taskId,
      title: content.title || template.name,
      description: content.description || null,
      status: content.status || "todo",
      priority: content.priority || "medium",
      projectId,
      createdById: user.id,
      assigneeId: null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    return NextResponse.json({ type: "task", task }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Unknown template type" },
    { status: 400 }
  );
}
