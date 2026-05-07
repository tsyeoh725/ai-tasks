import { db } from "@/db";
import { tasks, projects } from "@/db/schema";
import { eq, and, inArray, desc, asc, count } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { logActivity } from "@/lib/activity";
import { notifyTaskAssigned } from "@/lib/notifications";
import { autoSyncSchedule } from "@/lib/time-blocker";
import { getAccessibleProjectIds } from "@/lib/queries/projects";
import { parsePagination } from "@/lib/api";
import { resolveWorkspaceForUser } from "@/lib/workspace";

const ALLOWED_STATUS = ["todo", "in_progress", "done", "blocked"] as const;
const ALLOWED_PRIORITY = ["low", "medium", "high", "urgent"] as const;

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const clientId = searchParams.get("clientId");
  const status = searchParams.get("status");
  const assignedToMe = searchParams.get("assignedToMe");
  const sort = searchParams.get("sort") ?? "createdAt";
  const { page, limit, offset } = parsePagination(searchParams);

  const conditions = [];

  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
    if (clientId) conditions.push(eq(tasks.clientId, clientId));
  } else if (clientId) {
    // tasks tagged to this client (direct) OR via projects with this client
    const projs = await db.query.projects.findMany({
      where: eq(projects.clientId, clientId),
      columns: { id: true },
    });
    const projectIds = projs.map((p) => p.id);
    if (projectIds.length === 0) {
      conditions.push(eq(tasks.clientId, clientId));
    } else {
      // clientId match OR any task in a project owned by this client
      // drizzle: build OR
      const { or: orFn } = await import("drizzle-orm");
      conditions.push(orFn(eq(tasks.clientId, clientId), inArray(tasks.projectId, projectIds))!);
    }
  } else {
    // Scope to the active workspace (cookie) so personal/team views don't
    // leak each other's tasks. F-22 in the May 2026 audit traced personal
    // sidebar showing empty while Tasks/Workload/Schedule still showed team
    // data to this call sliding in without a workspace argument.
    const ws = await resolveWorkspaceForUser(user.id);
    const projectIds = await getAccessibleProjectIds(user.id, ws);
    if (projectIds.length === 0) {
      return NextResponse.json({ tasks: [], total: 0, page, limit, hasMore: false });
    }
    conditions.push(inArray(tasks.projectId, projectIds));
  }

  if (status) {
    conditions.push(eq(tasks.status, status as "todo" | "in_progress" | "done" | "blocked"));
  }

  if (assignedToMe === "true") {
    conditions.push(eq(tasks.assigneeId, user.id));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = sort === "dueDate"
    ? [asc(tasks.dueDate), desc(tasks.createdAt)]
    : sort === "priority"
    ? [desc(tasks.priority), desc(tasks.createdAt)]
    : [desc(tasks.createdAt)];

  const [result, [{ total }]] = await Promise.all([
    db.query.tasks.findMany({
      where,
      with: {
        project: { columns: { name: true, color: true } },
        client: { columns: { id: true, name: true, logoUrl: true, brandColor: true } },
        // F-13: drop assignee email from list rows; name is enough to render
        // avatars/badges. The task detail panel can fetch the email on click.
        assignee: { columns: { id: true, name: true } },
        subtasks: true,
      },
      orderBy,
      limit,
      offset,
    }),
    db.select({ total: count() }).from(tasks).where(where),
  ]);

  return NextResponse.json({ tasks: result, total, page, limit, hasMore: page * limit < total });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const title = asString(body.title);
  const description = asString(body.description);
  const status = asString(body.status);
  const priority = asString(body.priority);
  const projectId = asString(body.projectId);
  const clientId = asString(body.clientId);
  const sectionId = asString(body.sectionId);
  const assigneeId = asString(body.assigneeId);
  const dueDate = body.dueDate;
  const taskType = asString(body.taskType);

  if (!title || !projectId) {
    return NextResponse.json({ error: "Title and projectId are required" }, { status: 400 });
  }

  if (!(await canAccessProject(projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (status && !(ALLOWED_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (priority && !(ALLOWED_PRIORITY as readonly string[]).includes(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(tasks).values({
    id,
    title,
    description: description || null,
    status: (status as typeof ALLOWED_STATUS[number] | undefined) || "todo",
    priority: (priority as typeof ALLOWED_PRIORITY[number] | undefined) || "medium",
    projectId,
    clientId: clientId || null,
    sectionId: sectionId || null,
    assigneeId: assigneeId || null,
    createdById: user.id,
    dueDate: dueDate && (typeof dueDate === "string" || typeof dueDate === "number" || dueDate instanceof Date) ? new Date(dueDate) : null,
    taskType: (taskType as "task" | "milestone" | "approval" | undefined) || "task",
    createdAt: now,
    updatedAt: now,
  });

  // Auto-link client to project if not already linked
  if (clientId) {
    const { projectClients } = await import("@/db/schema");
    const existing = await db.query.projectClients.findFirst({
      where: (pc, { and, eq }) => and(eq(pc.projectId, projectId), eq(pc.clientId, clientId)),
    });
    if (!existing) {
      await db.insert(projectClients).values({
        id: uuid(),
        projectId,
        clientId,
        createdAt: now,
      });
    }
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: {
      project: { columns: { name: true, color: true } },
      assignee: { columns: { name: true, email: true } },
      subtasks: true,
    },
  });

  // Log activity
  await logActivity({
    entityType: "task",
    entityId: id,
    userId: user.id!,
    action: "created",
    metadata: { title, projectId },
  });

  // Notify assignee
  if (assigneeId && assigneeId !== user.id) {
    await notifyTaskAssigned(assigneeId, user.name!, title, id);
  }

  // Trigger background schedule sync if task is assigned to someone (fire-and-forget)
  const assignedTo = assigneeId || null;
  if (assignedTo) {
    autoSyncSchedule(assignedTo).catch((err) => {
      console.error("Background auto-sync failed:", err);
    });
  }

  return NextResponse.json(task, { status: 201 });
}
