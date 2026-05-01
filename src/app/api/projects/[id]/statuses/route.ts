import { db } from "@/db";
import { projectStatuses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { canAccessProject } from "@/lib/access";
import { v4 as uuid } from "uuid";

// GET /api/projects/[id]/statuses
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statuses = await db.query.projectStatuses.findMany({
    where: eq(projectStatuses.projectId, id),
    orderBy: (s, { asc }) => [asc(s.sortOrder)],
  });

  return NextResponse.json(statuses);
}

// POST /api/projects/[id]/statuses — create a new status
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, color, sortOrder, isFinal } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const statusId = uuid();
  await db.insert(projectStatuses).values({
    id: statusId,
    projectId: id,
    name,
    color: color ?? "#6366f1",
    sortOrder: sortOrder ?? 0,
    isDefault: false,
    isFinal: isFinal ?? false,
    createdAt: new Date(),
  });

  const status = await db.query.projectStatuses.findFirst({ where: eq(projectStatuses.id, statusId) });
  return NextResponse.json(status, { status: 201 });
}
