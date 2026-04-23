import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number; // every N days/weeks/months
  dayOfWeek?: number[]; // 0=Sun, 1=Mon... for weekly
  dayOfMonth?: number; // for monthly
  endDate?: string; // ISO date to stop recurring
};

/**
 * Calculate the next due date based on the recurrence rule
 */
export function getNextDueDate(currentDueDate: Date | null, rule: RecurrenceRule): Date {
  const base = currentDueDate ? new Date(currentDueDate) : new Date();

  switch (rule.frequency) {
    case "daily":
      base.setDate(base.getDate() + rule.interval);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7 * rule.interval);
      break;
    case "monthly":
      base.setMonth(base.getMonth() + rule.interval);
      if (rule.dayOfMonth) {
        base.setDate(rule.dayOfMonth);
      }
      break;
  }

  return base;
}

/**
 * Create the next recurring task instance when a recurring task is completed
 */
export async function createNextRecurrence(taskId: string): Promise<string | null> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });

  if (!task || !task.recurrenceRule) return null;

  let rule: RecurrenceRule;
  try {
    rule = JSON.parse(task.recurrenceRule);
  } catch {
    return null;
  }

  // Check if past end date
  if (rule.endDate && new Date() > new Date(rule.endDate)) {
    return null;
  }

  const nextDueDate = getNextDueDate(task.dueDate, rule);
  const newId = uuid();

  await db.insert(tasks).values({
    id: newId,
    title: task.title,
    description: task.description,
    status: "todo",
    priority: task.priority,
    projectId: task.projectId,
    assigneeId: task.assigneeId,
    createdById: task.createdById,
    dueDate: nextDueDate,
    recurrenceRule: task.recurrenceRule,
    recurrenceParentId: task.recurrenceParentId || task.id,
    sortOrder: 0,
  });

  return newId;
}
