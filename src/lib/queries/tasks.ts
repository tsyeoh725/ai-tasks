import { db } from "@/db";
import { tasks } from "@/db/schema";
import { and, eq, inArray, lt, ne, gte, lte, isNull, or, desc } from "drizzle-orm";
import { getAccessibleProjectIds } from "./projects";

export type FormattedTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  // Client info — resolved from tasks.clientId or projects.clientId or projects.category
  clientId: string | null;
  clientName: string | null;
  assignee: { name: string } | null;
};

type TaskWithRelations = typeof tasks.$inferSelect & {
  project: { name: string; color: string; clientId: string | null; category: string | null; client?: { id: string; name: string } | null };
  client?: { id: string; name: string } | null;
  assignee: { name: string } | null;
};

export function formatTask(t: TaskWithRelations): FormattedTask {
  // Prefer task.client (direct), then project.client (FK), then project.category (legacy text)
  const clientName =
    t.client?.name ??
    t.project.client?.name ??
    t.project.category ??
    null;
  const clientId =
    t.client?.id ??
    t.project.client?.id ??
    t.project.clientId ??
    null;
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt?.toISOString() ?? null,
    projectId: t.projectId,
    projectName: t.project.name,
    projectColor: t.project.color,
    clientId,
    clientName,
    assignee: t.assignee ? { name: t.assignee.name } : null,
  };
}

/**
 * Day boundaries used by every "upcoming / overdue / due today" view.
 * Keeping them in one place so widgets and tabs agree on what "today" means.
 */
export function getDayBoundaries(now: Date = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(today.getTime() + 86400000);
  const weekEnd = new Date(today.getTime() + 7 * 86400000);
  const weekStart = new Date(today.getTime() - 7 * 86400000);
  return { today, todayEnd, weekEnd, weekStart };
}

/**
 * Returns every task visible to the user, joined with project + assignee columns
 * used by the formatters. This is the authoritative list — derive overdue /
 * dueToday / upcoming / completed slices from it so every widget agrees.
 */
export async function getAccessibleTasks(userId: string) {
  const projectIds = await getAccessibleProjectIds(userId);
  if (projectIds.length === 0) return [];
  return db.query.tasks.findMany({
    where: inArray(tasks.projectId, projectIds),
    with: {
      project: {
        columns: { name: true, color: true, clientId: true, category: true },
        with: { client: { columns: { id: true, name: true } } },
      },
      client: { columns: { id: true, name: true } },
      assignee: { columns: { name: true } },
    },
    orderBy: [desc(tasks.updatedAt)],
  });
}

export type MyTasksTab = "upcoming" | "overdue" | "completed" | "today" | "all";

export type MyTasksOptions = {
  tab?: MyTasksTab;
  priority?: "low" | "medium" | "high" | "urgent";
};

/**
 * Tasks assigned to (or owned by) the user, sliced by tab.
 * - upcoming: due in next 7 days, not done
 * - overdue: past due, not done
 * - completed: done in last 7 days, sorted by completedAt desc
 * - today: due today, not done
 * - all: not done, no date filter
 */
export async function getMyTasks(
  userId: string,
  { tab = "all", priority }: MyTasksOptions = {}
) {
  const projectIds = await getAccessibleProjectIds(userId);
  if (projectIds.length === 0) return [];

  const { today, todayEnd, weekEnd, weekStart } = getDayBoundaries();
  const conditions = [
    inArray(tasks.projectId, projectIds),
    or(eq(tasks.assigneeId, userId), eq(tasks.createdById, userId)),
  ];

  if (priority) conditions.push(eq(tasks.priority, priority));

  if (tab === "overdue") {
    conditions.push(lt(tasks.dueDate, today));
    conditions.push(ne(tasks.status, "done"));
  } else if (tab === "today") {
    conditions.push(gte(tasks.dueDate, today));
    conditions.push(lt(tasks.dueDate, todayEnd));
    conditions.push(ne(tasks.status, "done"));
  } else if (tab === "upcoming") {
    conditions.push(gte(tasks.dueDate, todayEnd));
    conditions.push(lt(tasks.dueDate, weekEnd));
    conditions.push(ne(tasks.status, "done"));
  } else if (tab === "completed") {
    conditions.push(eq(tasks.status, "done"));
    conditions.push(gte(tasks.completedAt, weekStart));
  } else {
    conditions.push(ne(tasks.status, "done"));
  }

  const rows = await db.query.tasks.findMany({
    where: and(...conditions),
    with: {
      project: {
        columns: { name: true, color: true, clientId: true, category: true },
        with: { client: { columns: { id: true, name: true } } },
      },
      client: { columns: { id: true, name: true } },
      assignee: { columns: { name: true } },
    },
    orderBy:
      tab === "completed"
        ? (t, { desc: d }) => [d(t.completedAt)]
        : (t, { asc }) => [asc(t.dueDate)],
  });

  return rows.map(formatTask);
}

/**
 * All overdue tasks visible to the user. Sorted by dueDate asc (oldest first).
 * Shared by Dashboard widget, Reports "Overdue Snapshot", AI tool
 * `queryOverdueTasks`, and My Tasks → Overdue tab.
 */
export async function getOverdueTasks(userId: string) {
  const projectIds = await getAccessibleProjectIds(userId);
  if (projectIds.length === 0) return [];

  const { today } = getDayBoundaries();
  const rows = await db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, projectIds),
      lt(tasks.dueDate, today),
      ne(tasks.status, "done")
    ),
    with: {
      project: {
        columns: { name: true, color: true, clientId: true, category: true },
        with: { client: { columns: { id: true, name: true } } },
      },
      client: { columns: { id: true, name: true } },
      assignee: { columns: { name: true } },
    },
    orderBy: (t, { asc }) => [asc(t.dueDate)],
  });
  return rows.map(formatTask);
}

/**
 * Returns a map of projectId → { totalTasks, completedTasks } for a list of
 * project IDs. Used by Dashboard Projects widget, Portfolios rows, and
 * project headers so the counts match.
 */
export async function getProjectTaskCounts(
  projectIds: string[]
): Promise<Map<string, { totalTasks: number; completedTasks: number }>> {
  const out = new Map<string, { totalTasks: number; completedTasks: number }>();
  if (projectIds.length === 0) return out;

  const rows = await db.query.tasks.findMany({
    where: inArray(tasks.projectId, projectIds),
    columns: { projectId: true, status: true },
  });

  for (const id of projectIds) out.set(id, { totalTasks: 0, completedTasks: 0 });
  for (const r of rows) {
    const entry = out.get(r.projectId);
    if (!entry) continue;
    entry.totalTasks += 1;
    if (r.status === "done") entry.completedTasks += 1;
  }
  return out;
}
