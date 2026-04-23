import { db } from "@/db";
import { projectMessages, projects, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const message = await db.query.projectMessages.findFirst({
    where: eq(projectMessages.id, id),
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  // Pin toggle — permitted for admins/owners of the team
  if (body.pinned !== undefined) {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, message.projectId) });
    let canPin = project?.ownerId === user.id;
    if (!canPin && project?.teamId) {
      const membership = await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, user.id!)),
      });
      if (membership && (membership.role === "owner" || membership.role === "admin")) {
        canPin = true;
      }
    }
    if (!canPin) {
      return NextResponse.json({ error: "Only admins can pin" }, { status: 403 });
    }
    updates.pinned = body.pinned === true;
  }

  // Content/title edits — only the author
  if (body.content !== undefined || body.title !== undefined) {
    if (message.authorId !== user.id) {
      return NextResponse.json({ error: "Only the author can edit" }, { status: 403 });
    }
    if (body.content !== undefined) updates.content = body.content;
    if (body.title !== undefined) updates.title = body.title || null;
  }

  await db.update(projectMessages).set(updates).where(eq(projectMessages.id, id));
  const updated = await db.query.projectMessages.findFirst({
    where: eq(projectMessages.id, id),
    with: {
      author: { columns: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const message = await db.query.projectMessages.findFirst({
    where: eq(projectMessages.id, id),
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Allow owner of the project or the author
  const project = await db.query.projects.findFirst({ where: eq(projects.id, message.projectId) });
  const isAuthor = message.authorId === user.id;
  let isAdmin = project?.ownerId === user.id;
  if (!isAdmin && project?.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, user.id!)),
    });
    if (membership && (membership.role === "owner" || membership.role === "admin")) {
      isAdmin = true;
    }
  }
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(projectMessages).where(eq(projectMessages.id, id));
  return NextResponse.json({ success: true });
}
