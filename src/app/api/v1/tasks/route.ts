import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { authenticateApiKey, apiUnauthorized } from "@/lib/api-auth";
import { canAccessProject } from "@/lib/access";
import { getAccessibleProjectIds } from "@/lib/queries/projects";
import { parseDueDate, resolveUserTimezone } from "@/lib/datetime";
import { db as drizzleDb } from "@/db";
import { userPreferences } from "@/db/schema";
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

  // SL-1: derive the project allowlist from the caller's identity.
  // - With project_id supplied: that project must be accessible.
  // - Without: scope to every project the user can see.
  let projectFilter: ReturnType<typeof inArray> | ReturnType<typeof eq>;
  if (projectId) {
    if (!(await canAccessProject(projectId, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    projectFilter = eq(tasks.projectId, projectId);
  } else {
    const ids = await getAccessibleProjectIds(user.id);
    if (ids.length === 0) {
      return NextResponse.json({ data: [], count: 0, limit, offset });
    }
    projectFilter = inArray(tasks.projectId, ids);
  }

  const conditions: Array<NonNullable<Parameters<typeof and>[0]>> = [projectFilter];
  if (status) {
    conditions.push(eq(tasks.status, status as "todo" | "in_progress" | "done" | "blocked"));
  }

  const result = await db.query.tasks.findMany({
    where: and(...conditions),
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

  // SL-1: gate the destination project. Previously any API key wrote into
  // any project_id the caller passed.
  if (!(await canAccessProject(project_id, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // SL-7: parse due_date in the user's tz instead of bare new Date().
  let parsedDue: Date | null = null;
  if (due_date) {
    const prefs = await drizzleDb.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    });
    const userTz = resolveUserTimezone(prefs?.timezone);
    parsedDue = parseDueDate(due_date, userTz);
    if (!parsedDue) {
      return NextResponse.json(
        { error: "Invalid due_date — use YYYY-MM-DD or ISO 8601" },
        { status: 400 },
      );
    }
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
    dueDate: parsedDue,
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
