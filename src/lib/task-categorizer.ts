import { generateAiResponse } from "@/lib/ai";

export type TaskCategory = "deep_work" | "creative" | "admin" | "meeting" | "quick_tasks" | "review";

export type CategorizedTask = {
  taskId: string;
  category: TaskCategory;
  estimatedMinutes: number;
  reason: string;
};

const VALID_CATEGORIES: TaskCategory[] = ["deep_work", "creative", "admin", "meeting", "quick_tasks", "review"];

const CATEGORY_SYSTEM_PROMPT = `You are a task categorization assistant. Categorize each task into exactly one of these categories:

- deep_work: Coding, writing, complex analysis, or focused problem-solving. Typically 60-120 minutes.
- creative: Brainstorming, design, planning, or ideation sessions. Typically 30-60 minutes.
- admin: Emails, status updates, administrative reviews, or routine coordination. Typically 15-30 minutes.
- review: Code review, document feedback, PR reviews, or approval workflows. Typically 20-45 minutes.
- quick_tasks: Small, simple items that can be completed quickly. Under 15 minutes.
- meeting: Scheduled calls, standups, syncs, or collaborative sessions. Duration varies.

For each task, return a JSON array with objects containing:
- taskId: the task's ID
- category: one of the categories above
- estimatedMinutes: your best estimate of how long the task will take
- reason: a brief explanation of why you chose this category

If a task includes an estimatedHours hint, use it to inform your estimatedMinutes (convert hours to minutes), but you may adjust slightly based on the task nature.

Return ONLY a valid JSON array, no other text or markdown formatting.`;

export async function categorizeTasks(
  tasks: Array<{
    id: string;
    title: string;
    description?: string | null;
    priority: string;
    estimatedHours?: number | null;
  }>
): Promise<CategorizedTask[]> {
  if (tasks.length === 0) return [];

  const taskSummaries = tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    description: t.description || "",
    priority: t.priority,
    estimatedHoursHint: t.estimatedHours ?? null,
  }));

  const userPrompt = `Categorize these tasks:\n\n${JSON.stringify(taskSummaries, null, 2)}`;

  try {
    const response = await generateAiResponse(CATEGORY_SYSTEM_PROMPT, userPrompt);

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return createDefaultCategorizations(tasks);
    }

    const parsed: unknown[] = JSON.parse(jsonMatch[0]);

    const results: CategorizedTask[] = parsed.map((item: unknown) => {
      const entry = item as Record<string, unknown>;
      const category = VALID_CATEGORIES.includes(entry.category as TaskCategory)
        ? (entry.category as TaskCategory)
        : "admin";

      return {
        taskId: String(entry.taskId),
        category,
        estimatedMinutes: typeof entry.estimatedMinutes === "number" ? entry.estimatedMinutes : 30,
        reason: typeof entry.reason === "string" ? entry.reason : "Categorized by AI",
      };
    });

    // Ensure all input tasks have a categorization
    const categorizedIds = new Set(results.map((r) => r.taskId));
    for (const task of tasks) {
      if (!categorizedIds.has(task.id)) {
        results.push({
          taskId: task.id,
          category: "admin",
          estimatedMinutes: task.estimatedHours ? task.estimatedHours * 60 : 30,
          reason: "Default categorization — not returned by AI",
        });
      }
    }

    return results;
  } catch {
    return createDefaultCategorizations(tasks);
  }
}

function createDefaultCategorizations(
  tasks: Array<{
    id: string;
    estimatedHours?: number | null;
  }>
): CategorizedTask[] {
  return tasks.map((t) => ({
    taskId: t.id,
    category: "admin" as TaskCategory,
    estimatedMinutes: t.estimatedHours ? t.estimatedHours * 60 : 30,
    reason: "Default categorization — AI categorization unavailable",
  }));
}
