import { db } from "@/db";
import {
  tasks,
  userPreferences,
  calendarEvents,
  timeBlocks,
  teams,
  teamMembers,
} from "@/db/schema";
import { eq, and, gte, lte, ne, inArray } from "drizzle-orm";
import { categorizeTasks, type CategorizedTask, type TaskCategory } from "./task-categorizer";
import { v4 as uuid } from "uuid";
import { generateAiResponse } from "@/lib/ai";
import { getAccessibleProjectIds } from "@/lib/queries/projects";

type TimeSlot = { start: Date; end: Date };

type ProposedBlock = {
  id: string;
  taskId: string | null;
  title: string;
  category: TaskCategory;
  startTime: Date;
  endTime: Date;
  aiGenerated: boolean;
};

const DEFAULT_PREFERENCES = {
  workStartTime: "09:00",
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
  workEndTime: "17:00",
  timezone: "America/New_York",
  focusTimePreference: "morning" as const,
};

// ---- Helper: parse "HH:MM" to Date on a given day ----

function timeStringToDate(timeStr: string, date: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

// ---- Helper: get start of day / end of day ----

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ---- 1. getUserPreferences ----

export async function getUserPreferences(userId: string) {
  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  if (!prefs) {
    return DEFAULT_PREFERENCES;
  }

  return {
    workStartTime: prefs.workStartTime,
    lunchStartTime: prefs.lunchStartTime,
    lunchEndTime: prefs.lunchEndTime,
    workEndTime: prefs.workEndTime,
    timezone: prefs.timezone,
    focusTimePreference: prefs.focusTimePreference,
  };
}

// ---- 2. getExistingEvents ----

export async function getExistingEvents(userId: string, date: Date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const events = await db.query.calendarEvents.findMany({
    where: and(
      eq(calendarEvents.userId, userId),
      gte(calendarEvents.startTime, dayStart),
      lte(calendarEvents.endTime, dayEnd)
    ),
  });

  // Treat ALL existing time blocks as busy (locked + manual unlocked).
  // Auto-sync deletes its own unlocked AI-generated blocks before recomputing,
  // so anything still here is either user-locked or hand-created — both
  // should be respected to avoid overlap.
  const existingBlocks = await db.query.timeBlocks.findMany({
    where: and(
      eq(timeBlocks.userId, userId),
      gte(timeBlocks.startTime, dayStart),
      lte(timeBlocks.endTime, dayEnd)
    ),
  });

  return {
    calendarEvents: events,
    lockedBlocks: existingBlocks,
  };
}

// ---- 3. getFreeSlots ----

export async function getFreeSlots(userId: string, date: Date): Promise<TimeSlot[]> {
  const prefs = await getUserPreferences(userId);
  const existing = await getExistingEvents(userId, date);

  const workStart = timeStringToDate(prefs.workStartTime, date);
  const workEnd = timeStringToDate(prefs.workEndTime, date);
  const lunchStart = timeStringToDate(prefs.lunchStartTime, date);
  const lunchEnd = timeStringToDate(prefs.lunchEndTime, date);

  // Collect all busy intervals
  const busy: TimeSlot[] = [{ start: lunchStart, end: lunchEnd }];

  for (const event of existing.calendarEvents) {
    busy.push({ start: new Date(event.startTime), end: new Date(event.endTime) });
  }

  for (const block of existing.lockedBlocks) {
    busy.push({ start: new Date(block.startTime), end: new Date(block.endTime) });
  }

  // Sort busy intervals by start time
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Subtract busy intervals from work hours
  const freeSlots: TimeSlot[] = [];
  let cursor = workStart.getTime();

  for (const interval of busy) {
    const busyStart = interval.start.getTime();
    const busyEnd = interval.end.getTime();

    if (busyStart > cursor) {
      const slotEnd = Math.min(busyStart, workEnd.getTime());
      if (slotEnd > cursor) {
        freeSlots.push({ start: new Date(cursor), end: new Date(slotEnd) });
      }
    }

    cursor = Math.max(cursor, busyEnd);
  }

  // Add remaining time after last busy interval
  if (cursor < workEnd.getTime()) {
    freeSlots.push({ start: new Date(cursor), end: new Date(workEnd.getTime()) });
  }

  return freeSlots;
}

// ---- 4. generateDaySchedule ----

export async function generateDaySchedule(
  userId: string,
  date: Date
): Promise<ProposedBlock[]> {
  const prefs = await getUserPreferences(userId);
  const freeSlots = await getFreeSlots(userId, date);

  if (freeSlots.length === 0) return [];

  // Fetch accessible projects
  const accessibleProjectIds = await getAccessibleProjectIds(userId);
  if (accessibleProjectIds.length === 0) return [];

  // Fetch uncompleted tasks assigned to this user
  const userTasks = await db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, accessibleProjectIds),
      eq(tasks.assigneeId, userId),
      ne(tasks.status, "done")
    ),
    orderBy: (t, { desc, asc }) => [desc(t.aiPriorityScore), asc(t.dueDate)],
    limit: 30,
  });

  if (userTasks.length === 0) return [];

  // Categorize tasks
  const categorized = await categorizeTasks(
    userTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
    }))
  );

  // Build a map for quick lookup
  const categoryMap = new Map<string, CategorizedTask>();
  for (const c of categorized) {
    categoryMap.set(c.taskId, c);
  }

  // Format data for AI scheduling
  const freeSlotsFormatted = freeSlots.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    durationMinutes: Math.round((s.end.getTime() - s.start.getTime()) / 60000),
  }));

  const tasksFormatted = categorized.map((c) => {
    const task = userTasks.find((t) => t.id === c.taskId);
    return {
      taskId: c.taskId,
      title: task?.title || "Untitled",
      category: c.category,
      estimatedMinutes: c.estimatedMinutes,
      priority: task?.priority || "medium",
      dueDate: task?.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : null,
      reason: c.reason,
    };
  });

  const scheduleSystemPrompt = `You are a time-blocking assistant that creates optimal daily schedules.

Rules:
- Place deep_work tasks during the user's focus time preference (${prefs.focusTimePreference}).
- Batch quick_tasks together into a single block when possible.
- Respect task deadlines — prioritize tasks with sooner due dates.
- Do not overfill the schedule — leave some buffer between blocks.
- Each block must fit within one of the available free slots.
- A block's start and end times must stay within the boundaries of a single free slot.

Return ONLY a valid JSON array of time block assignments, no other text or markdown. Each entry:
{
  "taskId": "the task ID or null for buffer/break blocks",
  "title": "block title",
  "category": "one of: deep_work, creative, admin, meeting, quick_tasks, review",
  "startTime": "ISO 8601 datetime",
  "endTime": "ISO 8601 datetime"
}`;

  const scheduleUserPrompt = `Schedule these tasks into the available time slots.

User preferences:
- Focus time preference: ${prefs.focusTimePreference}
- Work hours: ${prefs.workStartTime} - ${prefs.workEndTime}

Available free slots:
${JSON.stringify(freeSlotsFormatted, null, 2)}

Tasks to schedule:
${JSON.stringify(tasksFormatted, null, 2)}`;

  try {
    const aiResponse = await generateAiResponse(scheduleSystemPrompt, scheduleUserPrompt);

    const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed: unknown[] = JSON.parse(jsonMatch[0]);

    const proposedBlocks: ProposedBlock[] = parsed.map((item: unknown) => {
      const entry = item as Record<string, unknown>;
      return {
        id: uuid(),
        taskId: entry.taskId ? String(entry.taskId) : null,
        title: String(entry.title || "Scheduled Block"),
        category: (entry.category as TaskCategory) || "admin",
        startTime: new Date(entry.startTime as string),
        endTime: new Date(entry.endTime as string),
        aiGenerated: true,
      };
    });

    // Save to database
    if (proposedBlocks.length > 0) {
      await db.insert(timeBlocks).values(
        proposedBlocks.map((block) => ({
          id: block.id,
          userId,
          taskId: block.taskId,
          title: block.title,
          category: block.category,
          startTime: block.startTime,
          endTime: block.endTime,
          isLocked: false,
          aiGenerated: true,
        }))
      );
    }

    return proposedBlocks;
  } catch {
    return [];
  }
}

// ---- 5. confirmBlock ----

export async function confirmBlock(blockId: string): Promise<void> {
  await db
    .update(timeBlocks)
    .set({ isLocked: true })
    .where(eq(timeBlocks.id, blockId));
}

// ---- Auto-sync: place each task on its due date ----

type ScheduleWarning = { taskId: string; title: string; reason: string };

// In-memory mutex to prevent concurrent auto-sync runs for the same user
// (e.g. React StrictMode double-fires effects in dev → two parallel POSTs
// would both delete + both create, producing duplicate blocks).
const syncLocks = new Map<string, Promise<{ blocks: ProposedBlock[]; warnings: ScheduleWarning[] }>>();

export async function autoSyncSchedule(
  userId: string
): Promise<{ blocks: ProposedBlock[]; warnings: ScheduleWarning[] }> {
  // If a sync is already running for this user, return that promise instead of starting a new one
  const existing = syncLocks.get(userId);
  if (existing) return existing;

  const promise = autoSyncScheduleInner(userId);
  syncLocks.set(userId, promise);
  try {
    return await promise;
  } finally {
    syncLocks.delete(userId);
  }
}

async function autoSyncScheduleInner(
  userId: string
): Promise<{ blocks: ProposedBlock[]; warnings: ScheduleWarning[] }> {
  const warnings: ScheduleWarning[] = [];
  const accessibleProjectIds = await getAccessibleProjectIds(userId);
  if (accessibleProjectIds.length === 0) return { blocks: [], warnings };

  // Delete ALL non-locked AI-generated blocks for this user (clean slate)
  await db
    .delete(timeBlocks)
    .where(
      and(
        eq(timeBlocks.userId, userId),
        eq(timeBlocks.aiGenerated, true),
        eq(timeBlocks.isLocked, false)
      )
    );

  // Fetch uncompleted tasks assigned to this user WITH a due date.
  // Tasks without a due date stay in the "Unscheduled Tasks" sidebar — they don't
  // auto-appear on the calendar. The schedule is for "what to do WHEN", not a backlog.
  const allUserTasks = await db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, accessibleProjectIds),
      eq(tasks.assigneeId, userId),
      ne(tasks.status, "done")
    ),
    orderBy: (t, { desc, asc }) => [desc(t.aiPriorityScore), asc(t.dueDate)],
    limit: 100,
  });

  // Only schedule tasks with a due date
  const userTasks = allUserTasks.filter((t) => t.dueDate !== null);

  if (userTasks.length === 0) return { blocks: [], warnings };

  // Categorize all tasks in one AI call for efficiency
  const categorized = await categorizeTasks(
    userTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
    }))
  );
  const categoryMap = new Map<string, CategorizedTask>();
  for (const c of categorized) categoryMap.set(c.taskId, c);

  const today = startOfDay(new Date());
  const allBlocks: ProposedBlock[] = [];
  const MAX_HORIZON_DAYS = 14; // if a task can't fit today, try up to 2 weeks ahead

  // Prepare task queue. Every task is placed starting from TODAY so the user
  // can start working on it right away — not wait until its due date.
  // Tasks with the earliest deadline land first in today's free slots, then
  // overflow spills to tomorrow, etc.
  type QueuedTask = {
    task: typeof userTasks[number];
    hasSpecificDueTime: boolean;
  };

  // Detect "date-only" due dates by checking UTC midnight — the client
  // serializes "YYYY-MM-DD" as UTC midnight, which in non-UTC timezones reads
  // as a non-zero local hour. If we used local hours here we'd mistakenly
  // treat date-only tasks as "due at 8pm" and constrain placement.
  const taskQueue: QueuedTask[] = userTasks.map((task) => {
    const dd = new Date(task.dueDate!);
    const hasSpecificDueTime = dd.getUTCHours() !== 0 || dd.getUTCMinutes() !== 0;
    return { task, hasSpecificDueTime };
  });

  // Sort by due date ASC (earliest deadline first), then priority DESC
  taskQueue.sort((a, b) => {
    const aDue = a.task.dueDate ? new Date(a.task.dueDate).getTime() : Infinity;
    const bDue = b.task.dueDate ? new Date(b.task.dueDate).getTime() : Infinity;
    if (aDue !== bDue) return aDue - bDue;
    return (b.task.aiPriorityScore ?? 0) - (a.task.aiPriorityScore ?? 0);
  });

  // Cache free slots + a running cursor per day so multi-task scheduling
  // stays consistent as we spill tasks to subsequent days.
  const freeSlotsByDay = new Map<string, TimeSlot[]>();
  const cursorByDay = new Map<string, number>();

  async function getFreeForDay(d: Date): Promise<TimeSlot[]> {
    const key = d.toISOString();
    if (!freeSlotsByDay.has(key)) {
      const slots = await getFreeSlots(userId, d);
      freeSlotsByDay.set(key, slots);
      cursorByDay.set(key, slots.length > 0 ? slots[0].start.getTime() : Infinity);
    }
    return freeSlotsByDay.get(key)!;
  }

  // Place each task, starting from TODAY. If today's slots are full, spill to
  // tomorrow, then the day after, up to MAX_HORIZON_DAYS.
  for (const queued of taskQueue) {
    const { task, hasSpecificDueTime } = queued;
    const cat = categoryMap.get(task.id);
    const durationMin =
      task.estimatedHours != null
        ? task.estimatedHours * 60
        : cat?.estimatedMinutes ?? 60;
    const durationMs = durationMin * 60 * 1000;

    // Effective deadline: if specific time, use it; else end of due day.
    const dd = new Date(task.dueDate!);
    const effectiveDeadlineMs = hasSpecificDueTime ? dd.getTime() : endOfDay(dd).getTime();

    let placed = false;

    for (let dayOffset = 0; dayOffset < MAX_HORIZON_DAYS; dayOffset++) {
      const tryDate = new Date(today);
      tryDate.setDate(tryDate.getDate() + dayOffset);
      const dayKey = tryDate.toISOString();

      const slots = await getFreeForDay(tryDate);
      if (slots.length === 0) continue;

      // Enforce due-time only if the due-time falls on this day
      let dueTimeMs: number | null = null;
      if (hasSpecificDueTime && startOfDay(dd).getTime() === tryDate.getTime()) {
        dueTimeMs = dd.getTime();
      }

      let cursor = cursorByDay.get(dayKey)!;

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const slotStart = slot.start.getTime();
        const slotEnd = slot.end.getTime();

        if (cursor < slotStart) cursor = slotStart;
        if (cursor >= slotEnd) continue;

        const proposedEnd = cursor + durationMs;
        const effectiveEndLimit = dueTimeMs != null ? Math.min(slotEnd, dueTimeMs) : slotEnd;

        if (proposedEnd <= effectiveEndLimit) {
          allBlocks.push({
            id: uuid(),
            taskId: task.id,
            title: task.title,
            category: cat?.category ?? "admin",
            startTime: new Date(cursor),
            endTime: new Date(proposedEnd),
            aiGenerated: true,
          });

          cursor = proposedEnd + 5 * 60 * 1000; // 5-min buffer
          cursorByDay.set(dayKey, cursor);
          placed = true;
          break;
        }

        // If due-time enforced and cursor is already past it, no later slot helps
        if (dueTimeMs != null && cursor + durationMs > dueTimeMs) {
          break;
        }

        // Try next slot on the same day
        cursor = slotEnd;
      }

      cursorByDay.set(dayKey, cursor);

      if (placed) break;
    }

    if (!placed) {
      warnings.push({
        taskId: task.id,
        title: task.title,
        reason: `couldn't find a ${Math.round(durationMin)}-minute slot in the next ${MAX_HORIZON_DAYS} days`,
      });
    } else {
      // Only warn if the placement actually ends AFTER the effective deadline.
      const justPlaced = allBlocks[allBlocks.length - 1];

      if (justPlaced.endTime.getTime() > effectiveDeadlineMs) {
        const placedStr = justPlaced.startTime.toISOString().split("T")[0];
        warnings.push({
          taskId: task.id,
          title: task.title,
          reason: `scheduled ${placedStr} — after the deadline`,
        });
      }
    }
  }

  // Save to database
  if (allBlocks.length > 0) {
    await db.insert(timeBlocks).values(
      allBlocks.map((block) => ({
        id: block.id,
        userId,
        taskId: block.taskId,
        title: block.title,
        category: block.category,
        startTime: block.startTime,
        endTime: block.endTime,
        isLocked: false,
        aiGenerated: true,
      }))
    );
  }

  return { blocks: allBlocks, warnings };
}

// ---- 6. getBlocksForDateRange ----

export async function getBlocksForDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  return db.query.timeBlocks.findMany({
    where: and(
      eq(timeBlocks.userId, userId),
      gte(timeBlocks.startTime, startDate),
      lte(timeBlocks.endTime, endDate)
    ),
    orderBy: (tb, { asc }) => [asc(tb.startTime)],
  });
}
