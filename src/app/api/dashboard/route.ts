import { db } from "@/db";
import { timeBlocks, activityLog, users } from "@/db/schema";
import { eq, and, inArray, gte, lte } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { getAccessibleProjects } from "@/lib/queries/projects";
import {
  getAccessibleTasks,
  formatTask,
  getDayBoundaries,
} from "@/lib/queries/tasks";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const accessibleProjects = await getAccessibleProjects(user.id);
  const projectIds = accessibleProjects.map((p) => p.id);

  if (projectIds.length === 0) {
    return NextResponse.json({
      overdue: [], dueToday: [], upcoming: [], completed: [],
      summary: null, projects: [], allTasks: [], todayBlocks: [], recentActivity: [],
      stats: { completedThisWeek: 0, totalOverdue: 0, totalTasks: 0 },
    });
  }

  const { today, todayEnd, weekEnd, weekStart } = getDayBoundaries();

  const allTasksRaw = await getAccessibleTasks(user.id);

  const allTasks = allTasksRaw.map(formatTask);
  const notDone = allTasksRaw.filter((t) => t.status !== "done");

  const overdue = notDone
    .filter((t) => t.dueDate && t.dueDate < today)
    .map(formatTask);

  const dueToday = notDone
    .filter((t) => t.dueDate && t.dueDate >= today && t.dueDate < todayEnd)
    .map(formatTask);

  const upcoming = notDone
    .filter((t) => t.dueDate && t.dueDate >= todayEnd && t.dueDate < weekEnd)
    .map(formatTask);

  const completed = allTasksRaw
    .filter((t) => t.status === "done" && t.completedAt && t.completedAt >= weekStart)
    .slice(0, 10)
    .map(formatTask);

  const completedThisWeek = allTasksRaw.filter(
    (t) => t.status === "done" && t.completedAt && t.completedAt >= weekStart
  ).length;

  const projectSummaries = accessibleProjects.map((p) => {
    const projectTasks = allTasksRaw.filter((t) => t.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      icon: p.icon,
      totalTasks: projectTasks.length,
      completedTasks: projectTasks.filter((t) => t.status === "done").length,
    };
  });

  const todayBlocks = await db.query.timeBlocks.findMany({
    where: and(
      eq(timeBlocks.userId, user.id),
      gte(timeBlocks.startTime, today),
      lte(timeBlocks.endTime, todayEnd),
    ),
    orderBy: (t, { asc }) => [asc(t.startTime)],
  });

  const formattedBlocks = todayBlocks.map((b) => ({
    id: b.id,
    title: b.title,
    category: b.category,
    startTime: b.startTime.toISOString(),
    endTime: b.endTime.toISOString(),
    taskId: b.taskId,
    isLocked: b.isLocked,
  }));

  const taskIds = allTasksRaw.map((t) => t.id);
  const recentActivityRaw = taskIds.length > 0
    ? await db.query.activityLog.findMany({
        where: and(
          eq(activityLog.entityType, "task"),
          inArray(activityLog.entityId, taskIds),
        ),
        orderBy: (a, { desc }) => [desc(a.createdAt)],
        limit: 15,
      })
    : [];

  const activityUserIds = [...new Set(recentActivityRaw.map((a) => a.userId).filter(Boolean))] as string[];
  const activityUsers = activityUserIds.length > 0
    ? await db.query.users.findMany({
        where: inArray(users.id, activityUserIds),
        columns: { id: true, name: true },
      })
    : [];
  const userNameMap = new Map(activityUsers.map((u) => [u.id, u.name]));
  const taskTitleMap = new Map(allTasksRaw.map((t) => [t.id, t.title]));

  const recentActivity = recentActivityRaw.map((a) => ({
    id: a.id,
    action: a.action,
    field: a.field,
    oldValue: a.oldValue,
    newValue: a.newValue,
    createdAt: a.createdAt.toISOString(),
    userName: a.userId ? userNameMap.get(a.userId) || "Someone" : "System",
    entityId: a.entityId,
    entityTitle: taskTitleMap.get(a.entityId) || "Task",
  }));

  return NextResponse.json({
    overdue,
    dueToday,
    upcoming,
    completed,
    summary: null,
    projects: projectSummaries,
    allTasks,
    todayBlocks: formattedBlocks,
    recentActivity,
    stats: {
      completedThisWeek,
      totalOverdue: overdue.length,
      totalTasks: allTasksRaw.length,
    },
  });
}
