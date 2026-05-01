import { db } from "@/db";
import { portfolioProjects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: portfolioId } = await params;
  const { projectId, status, statusNote } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  // Check if project already in portfolio
  const existing = await db.query.portfolioProjects.findFirst({
    where: and(
      eq(portfolioProjects.portfolioId, portfolioId),
      eq(portfolioProjects.projectId, projectId)
    ),
  });

  if (existing) {
    return NextResponse.json(
      { error: "Project already in portfolio" },
      { status: 409 }
    );
  }

  const ppId = uuid();
  await db.insert(portfolioProjects).values({
    id: ppId,
    portfolioId,
    projectId,
    status: status || "on_track",
    statusNote: statusNote || null,
    addedAt: new Date(),
  });

  const created = await db.query.portfolioProjects.findFirst({
    where: eq(portfolioProjects.id, ppId),
    with: { project: true },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: portfolioId } = await params;
  const { projectId, status, statusNote } = await req.json();

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (statusNote !== undefined) updateData.statusNote = statusNote;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update" },
      { status: 400 }
    );
  }

  await db
    .update(portfolioProjects)
    .set(updateData)
    .where(
      and(
        eq(portfolioProjects.portfolioId, portfolioId),
        eq(portfolioProjects.projectId, projectId)
      )
    );

  const updated = await db.query.portfolioProjects.findFirst({
    where: and(
      eq(portfolioProjects.portfolioId, portfolioId),
      eq(portfolioProjects.projectId, projectId)
    ),
    with: { project: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id: portfolioId } = await params;
  const { projectId } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  await db
    .delete(portfolioProjects)
    .where(
      and(
        eq(portfolioProjects.portfolioId, portfolioId),
        eq(portfolioProjects.projectId, projectId)
      )
    );

  return NextResponse.json({ success: true });
}
