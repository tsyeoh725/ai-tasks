import { db } from "@/db";
import { reports, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

async function getAccessibleReport(id: string, userId: string) {
  const report = await db.query.reports.findFirst({
    where: eq(reports.id, id),
  });
  if (!report) return null;

  if (report.ownerId === userId) return report;

  if (report.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, report.teamId),
        eq(teamMembers.userId, userId)
      ),
    });
    if (membership) return report;
  }

  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const report = await getAccessibleReport(id, user.id);

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const report = await getAccessibleReport(id, user.id);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates = await req.json();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.layout !== undefined) {
    updateData.layout =
      typeof updates.layout === "string"
        ? updates.layout
        : JSON.stringify(updates.layout);
  }
  if (updates.teamId !== undefined) updateData.teamId = updates.teamId;

  await db.update(reports).set(updateData).where(eq(reports.id, id));

  const updated = await db.query.reports.findFirst({
    where: eq(reports.id, id),
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
  const report = await getAccessibleReport(id, user.id);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(reports).where(eq(reports.id, id));
  return NextResponse.json({ success: true });
}
