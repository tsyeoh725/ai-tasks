import { db } from "@/db";
import { tasks, projects, teamMembers, users } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { logActivity } from "@/lib/activity";

type IncomingRow = {
  title?: string;
  status?: string;
  priority?: string;
  assigneeEmail?: string;
  dueDate?: string;
  description?: string;
};

type Status = "todo" | "in_progress" | "done" | "blocked";
type Priority = "low" | "medium" | "high" | "urgent";

const STATUS_ALIASES: Record<string, Status> = {
  todo: "todo",
  "to do": "todo",
  "to-do": "todo",
  open: "todo",
  new: "todo",
  in_progress: "in_progress",
  "in progress": "in_progress",
  doing: "in_progress",
  wip: "in_progress",
  done: "done",
  complete: "done",
  completed: "done",
  closed: "done",
  blocked: "blocked",
  blocker: "blocked",
};

const PRIORITY_ALIASES: Record<string, Priority> = {
  low: "low",
  medium: "medium",
  med: "medium",
  normal: "medium",
  high: "high",
  urgent: "urgent",
  critical: "urgent",
  p0: "urgent",
  p1: "high",
  p2: "medium",
  p3: "low",
};

function normalizeStatus(raw: string | undefined): Status {
  if (!raw) return "todo";
  const key = raw.trim().toLowerCase();
  return STATUS_ALIASES[key] ?? "todo";
}

function normalizePriority(raw: string | undefined): Priority {
  if (!raw) return "medium";
  const key = raw.trim().toLowerCase();
  return PRIORITY_ALIASES[key] ?? "medium";
}

function parseDueDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !user.id) return unauthorized();

  const { id } = await params;

  // Authorize: project exists and user has access (owner or team member).
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.ownerId !== user.id) {
    if (!project.teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const member = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, project.teamId),
        eq(teamMembers.userId, user.id),
      ),
    });
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const rows = (body as { rows?: IncomingRow[] }).rows;
  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { error: "Expected { rows: [...] } in body" },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ created: 0, failed: [] });
  }

  if (rows.length > 5000) {
    return NextResponse.json(
      { error: "Too many rows (max 5000 per import)" },
      { status: 400 },
    );
  }

  // Collect distinct assignee emails for a single lookup.
  const emails = Array.from(
    new Set(
      rows
        .map((r) => (r.assigneeEmail || "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );

  const emailToUserId = new Map<string, string>();
  if (emails.length > 0) {
    const found = await db.query.users.findMany({
      where: inArray(users.email, emails),
      columns: { id: true, email: true },
    });
    for (const u of found) {
      emailToUserId.set(u.email.toLowerCase(), u.id);
    }
  }

  const failed: Array<{ row: number; reason: string }> = [];
  const toInsert: Array<typeof tasks.$inferInsert> = [];
  const now = new Date();

  rows.forEach((row, idx) => {
    const title = (row.title || "").trim();
    if (!title) {
      failed.push({ row: idx, reason: "Missing title" });
      return;
    }

    let assigneeId: string | null = null;
    const email = (row.assigneeEmail || "").trim().toLowerCase();
    if (email) {
      const matched = emailToUserId.get(email);
      if (matched) {
        assigneeId = matched;
      } else {
        // Unknown assignee is not fatal — import without assignee and warn.
        failed.push({
          row: idx,
          reason: `Assignee email "${email}" not found; imported without assignee`,
        });
      }
    }

    const dueDate = parseDueDate(row.dueDate);
    if (row.dueDate && row.dueDate.trim() && !dueDate) {
      // Date was provided but unparseable — warn but don't block.
      failed.push({
        row: idx,
        reason: `Unrecognized due date "${row.dueDate}"; imported without due date`,
      });
    }

    toInsert.push({
      id: uuid(),
      title,
      description: (row.description || "").trim() || null,
      status: normalizeStatus(row.status),
      priority: normalizePriority(row.priority),
      projectId: id,
      sectionId: null,
      assigneeId: assigneeId,
      createdById: user.id!,
      dueDate: dueDate,
      taskType: "task",
      createdAt: now,
      updatedAt: now,
    });
  });

  if (toInsert.length === 0) {
    return NextResponse.json({ created: 0, failed });
  }

  // Insert in a single batch for performance.
  await db.insert(tasks).values(toInsert);

  // Log activity for each (fire-and-forget style, but awaited for correctness).
  await Promise.all(
    toInsert.map((t) =>
      logActivity({
        entityType: "task",
        entityId: t.id!,
        userId: user.id!,
        action: "created",
        metadata: { title: t.title, projectId: id, source: "csv-import" },
      }).catch(() => {
        // Ignore logging failures
      }),
    ),
  );

  return NextResponse.json({ created: toInsert.length, failed });
}
