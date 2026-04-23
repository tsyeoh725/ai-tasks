import { db } from "@/db";
import { projectBriefs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const brief = await db.query.projectBriefs.findFirst({
    where: eq(projectBriefs.projectId, projectId),
  });

  return NextResponse.json(brief || { content: "{}" });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { projectId, content } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const existing = await db.query.projectBriefs.findFirst({
    where: eq(projectBriefs.projectId, projectId),
  });

  const now = new Date();

  if (existing) {
    await db.update(projectBriefs)
      .set({ content: JSON.stringify(content), updatedById: user.id, updatedAt: now })
      .where(eq(projectBriefs.id, existing.id));
  } else {
    await db.insert(projectBriefs).values({
      id: uuid(),
      projectId,
      content: JSON.stringify(content),
      updatedById: user.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ success: true });
}
