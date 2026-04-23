import { db } from "@/db";
import { portfolios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { getProjectTaskCounts } from "@/lib/queries/tasks";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.id, id),
    with: {
      projects: {
        with: {
          project: true,
        },
      },
    },
  });

  if (!portfolio) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const counts = await getProjectTaskCounts(
    portfolio.projects.map((pp) => pp.projectId)
  );

  const projectsWithStats = portfolio.projects.map((pp) => {
    const c = counts.get(pp.projectId);
    return {
      ...pp,
      taskCount: c?.totalTasks ?? 0,
      doneCount: c?.completedTasks ?? 0,
    };
  });

  return NextResponse.json({
    ...portfolio,
    projects: projectsWithStats,
  });
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
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.color !== undefined) updateData.color = updates.color;

  await db.update(portfolios).set(updateData).where(eq(portfolios.id, id));

  const updated = await db.query.portfolios.findFirst({
    where: eq(portfolios.id, id),
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
  await db.delete(portfolios).where(eq(portfolios.id, id));
  return NextResponse.json({ success: true });
}
