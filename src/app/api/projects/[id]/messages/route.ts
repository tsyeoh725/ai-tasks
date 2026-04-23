import { db } from "@/db";
import { projectMessages, projects, teamMembers, notifications } from "@/db/schema";
import { eq, desc, and, ne } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const items = await db.query.projectMessages.findMany({
    where: eq(projectMessages.projectId, id),
    with: {
      author: { columns: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: [desc(projectMessages.pinned), desc(projectMessages.createdAt)],
  });

  return NextResponse.json({ messages: items });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const { title, content } = body as { title?: string; content: string };

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const messageId = uuid();
  const now = new Date();

  await db.insert(projectMessages).values({
    id: messageId,
    projectId: id,
    authorId: user.id!,
    title: title || null,
    content,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  });

  // Insert notifications for all team members (excluding author)
  if (project.teamId) {
    const members = await db.query.teamMembers.findMany({
      where: and(eq(teamMembers.teamId, project.teamId), ne(teamMembers.userId, user.id!)),
    });
    if (members.length > 0) {
      await db.insert(notifications).values(
        members.map((m) => ({
          id: uuid(),
          userId: m.userId,
          type: "message" as const,
          title: `${user.name || "Someone"} posted in ${project.name}`,
          message: title || content.slice(0, 140),
          entityType: "project" as const,
          entityId: id,
          read: false,
          createdAt: now,
        })),
      );
    }
  }

  const created = await db.query.projectMessages.findFirst({
    where: eq(projectMessages.id, messageId),
    with: {
      author: { columns: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
