import { db } from "@/db";
import { tasks, projects, teamMembers } from "@/db/schema";
import { eq, and, or, isNull, inArray, desc } from "drizzle-orm";
import { authenticateApiKey, apiUnauthorized } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const conditions = [];
  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
  }
  if (status) {
    conditions.push(eq(tasks.status, status as "todo" | "in_progress" | "done" | "blocked"));
  }

  const result = await db.query.tasks.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      project: { columns: { id: true, name: true } },
      assignee: { columns: { id: true, name: true } },
    },
    orderBy: [desc(tasks.createdAt)],
    limit,
    offset,
  });

  return NextResponse.json({ data: result, count: result.length, limit, offset });
}

export async function POST(req: Request) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const body = await req.json();
  const { title, description, status, priority, project_id, assignee_id, due_date } = body;

  if (!title || !project_id) {
    return NextResponse.json({ error: "title and project_id are required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(tasks).values({
    id,
    title,
    description: description || null,
    status: status || "todo",
    priority: priority || "medium",
    projectId: project_id,
    assigneeId: assignee_id || null,
    createdById: user.id,
    dueDate: due_date ? new Date(due_date) : null,
    createdAt: now,
    updatedAt: now,
  });

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: { columns: { id: true, name: true } },
      assignee: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
