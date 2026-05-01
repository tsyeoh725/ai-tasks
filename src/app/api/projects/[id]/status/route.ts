import { db } from "@/db";
import { projectStatusUpdates, projects, teamMembers, notifications } from "@/db/schema";
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

  const items = await db.query.projectStatusUpdates.findMany({
    where: eq(projectStatusUpdates.projectId, id),
    with: {
      author: { columns: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: [desc(projectStatusUpdates.createdAt)],
  });

  return NextResponse.json({ updates: items });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const { status, summary, highlights, blockers } = body as {
    status: "on_track" | "at_risk" | "off_track" | "on_hold" | "complete";
    summary: string;
    highlights?: string[];
    blockers?: string[];
  };

  if (!status || !summary) {
    return NextResponse.json({ error: "status and summary required" }, { status: 400 });
  }

  const updateId = uuid();
  const now = new Date();

  await db.insert(projectStatusUpdates).values({
    id: updateId,
    projectId: id,
    status,
    summary,
    highlights: highlights && highlights.length > 0 ? JSON.stringify(highlights) : null,
    blockers: blockers && blockers.length > 0 ? JSON.stringify(blockers) : null,
    authorId: user.id!,
    createdAt: now,
  });

  // Notify team members
  if (project.teamId) {
    const members = await db.query.teamMembers.findMany({
      where: and(eq(teamMembers.teamId, project.teamId), ne(teamMembers.userId, user.id!)),
    });
    if (members.length > 0) {
      await db.insert(notifications).values(
        members.map((m) => ({
          id: uuid(),
          userId: m.userId,
          type: "status_update" as const,
          title: `${project.name}: status updated to ${status.replace("_", " ")}`,
          message: summary.slice(0, 140),
          entityType: "project" as const,
          entityId: id,
          read: false,
          createdAt: now,
        })),
      );
    }
  }

  const created = await db.query.projectStatusUpdates.findFirst({
    where: eq(projectStatusUpdates.id, updateId),
    with: {
      author: { columns: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
