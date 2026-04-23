import { db } from "@/db";
import { tasks, userPreferences, calendarEvents, timeBlocks } from "@/db/schema";
import { eq, and, ne, gte, lte } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { generateAiResponse } from "@/lib/ai";
import { getUserPreferences, getFreeSlots } from "@/lib/time-blocker";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { projectId } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  // Get active tasks for this project
  const projectTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, projectId),
      ne(tasks.status, "done"),
    ),
    with: { subtasks: true },
  });

  if (projectTasks.length === 0) {
    return NextResponse.json({ message: "No active tasks to prioritize" });
  }

  // Get schedule context
  const prefs = await getUserPreferences(user.id!);
  const today = new Date();

  // Calculate available hours for this week
  let totalFreeMinutes = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const freeSlots = await getFreeSlots(user.id!, d);
    totalFreeMinutes += freeSlots.reduce((sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000), 0);
  }
  const totalFreeHours = Math.round(totalFreeMinutes / 60 * 10) / 10;

  const taskList = projectTasks.map((t) => {
    const subtaskProgress = t.subtasks.length > 0
      ? ` (${t.subtasks.filter((s) => s.isDone).length}/${t.subtasks.length} subtasks done)`
      : "";
    const estHours = t.estimatedHours ? ` | Estimated: ${t.estimatedHours}h` : "";
    return `- ID: ${t.id} | "${t.title}" | Status: ${t.status} | Priority: ${t.priority} | Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "none"}${estHours}${subtaskProgress}`;
  }).join("\n");

  const systemPrompt = `You are a schedule-aware task prioritization expert. Analyze the tasks below and return a JSON array ranking them from highest to lowest priority.

User's work schedule: ${prefs.workStartTime}-${prefs.workEndTime}, lunch ${prefs.lunchStartTime}-${prefs.lunchEndTime}
Focus time preference: ${prefs.focusTimePreference}
Available work time this week: ${totalFreeHours} hours
Today's date: ${today.toISOString().split("T")[0]}

For each task, provide:
- id: the task ID
- score: a number from 1-100 (100 = highest priority)
- reason: a brief explanation (under 50 words)
- estimatedHours: estimated hours to complete (your best guess if not provided)
- category: one of "deep_work", "creative", "admin", "review", "quick_tasks"
- schedulable: boolean - can this be completed before its deadline given available time?
- warning: string or null - if schedulable is false, explain why (e.g. "Not enough free time before deadline")

Consider: due dates, available time remaining until deadline, current status, stated priority, task complexity, and estimated hours.
Return ONLY valid JSON like: [{"id":"...", "score": 95, "reason": "...", "estimatedHours": 2, "category": "deep_work", "schedulable": true, "warning": null}]`;

  try {
    const response = await generateAiResponse(systemPrompt, `Tasks to prioritize:\n${taskList}`);

    // Parse AI response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI returned invalid format" }, { status: 500 });
    }

    const rankings = JSON.parse(jsonMatch[0]) as {
      id: string;
      score: number;
      reason: string;
      estimatedHours?: number;
      category?: string;
      schedulable?: boolean;
      warning?: string | null;
    }[];

    // Update tasks with AI scores
    for (const ranking of rankings) {
      const setValues: Record<string, unknown> = {
        aiPriorityScore: ranking.score,
        aiPriorityReason: ranking.reason,
        updatedAt: new Date(),
      };
      if (ranking.estimatedHours && !projectTasks.find(t => t.id === ranking.id)?.estimatedHours) {
        setValues.estimatedHours = ranking.estimatedHours;
      }
      await db.update(tasks)
        .set(setValues)
        .where(eq(tasks.id, ranking.id));
    }

    return NextResponse.json({
      rankings,
      scheduleContext: {
        availableHoursThisWeek: totalFreeHours,
        totalEstimatedHours: rankings.reduce((sum, r) => sum + (r.estimatedHours || 1), 0),
        unschedulableTasks: rankings.filter(r => r.schedulable === false).length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "AI service error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
