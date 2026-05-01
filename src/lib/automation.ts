import { db } from "@/db";
import { automationRules, tasks, taskComments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";
import { generateAiResponse } from "@/lib/ai";
import { v4 as uuid } from "uuid";

type TriggerType = "status_changed" | "task_created" | "due_date_passed" | "assigned" | "priority_changed";
type ActionType =
  | "set_status"
  | "set_priority"
  | "assign"
  | "add_comment"
  | "notify"
  | "ai_summarise"
  | "ai_triage"
  | "ai_rewrite";

type Trigger = {
  type: TriggerType;
  conditions?: Record<string, string>;
};

type Action = {
  type: ActionType;
  params: Record<string, string>;
};

export type { TriggerType, ActionType, Trigger, Action };

export function matchesTrigger(
  trigger: Trigger,
  event: { type: string; data?: Record<string, string> }
): boolean {
  if (trigger.type !== event.type) return false;

  if (trigger.conditions) {
    for (const [key, value] of Object.entries(trigger.conditions)) {
      if (!event.data || event.data[key] !== value) {
        return false;
      }
    }
  }

  return true;
}

export async function evaluateRules(
  projectId: string,
  event: { type: TriggerType; taskId: string; data?: Record<string, string> }
): Promise<Array<{ ruleId: string; ruleName: string; actionsExecuted: number }>> {
  const rules = await db.query.automationRules.findMany({
    where: eq(automationRules.projectId, projectId),
  });

  const enabledRules = rules.filter((r) => r.enabled);
  const results: Array<{ ruleId: string; ruleName: string; actionsExecuted: number }> = [];

  for (const rule of enabledRules) {
    let trigger: Trigger;
    let actions: Action[];

    try {
      trigger = JSON.parse(rule.trigger) as Trigger;
      actions = JSON.parse(rule.actions) as Action[];
    } catch {
      continue;
    }

    if (!matchesTrigger(trigger, event)) continue;

    let actionsExecuted = 0;

    for (const action of actions) {
      try {
        switch (action.type) {
          case "set_status": {
            await db
              .update(tasks)
              .set({
                status: action.params.status as "todo" | "in_progress" | "done" | "blocked",
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, event.taskId));
            actionsExecuted++;
            break;
          }
          case "set_priority": {
            await db
              .update(tasks)
              .set({
                priority: action.params.priority as "low" | "medium" | "high" | "urgent",
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, event.taskId));
            actionsExecuted++;
            break;
          }
          case "assign": {
            await db
              .update(tasks)
              .set({ assigneeId: action.params.userId || null, updatedAt: new Date() })
              .where(eq(tasks.id, event.taskId));
            actionsExecuted++;
            break;
          }
          case "add_comment": {
            await db.insert(taskComments).values({
              id: uuid(),
              taskId: event.taskId,
              content: `[System] ${action.params.message || "Automated action triggered"}`,
              authorId: null,
              isAi: false,
            });
            actionsExecuted++;
            break;
          }
          case "notify": {
            if (action.params.userId) {
              await createNotification({
                userId: action.params.userId,
                type: "status_changed",
                title: action.params.title || `Automation "${rule.name}" triggered`,
                message: action.params.message,
                entityType: "task",
                entityId: event.taskId,
              });
            }
            actionsExecuted++;
            break;
          }
          case "ai_summarise": {
            const task = await db.query.tasks.findFirst({
              where: eq(tasks.id, event.taskId),
              with: {
                comments: {
                  orderBy: (c, { asc }) => [asc(c.createdAt)],
                },
              },
            });
            if (!task) break;

            const commentText = task.comments
              .map((c) => `- ${c.isAi ? "[AI]" : ""} ${c.content}`)
              .join("\n");

            const summary = await generateAiResponse(
              "You are a concise summariser. Produce a 2-4 sentence summary of the conversation on a task. Focus on decisions, open questions, and next steps. No preamble.",
              `Task: ${task.title}\nDescription: ${task.description || "(none)"}\n\nComments:\n${commentText || "(no comments)"}`,
            );

            await db.insert(taskComments).values({
              id: uuid(),
              taskId: event.taskId,
              content: `[AI Summary] ${summary.trim()}`,
              authorId: null,
              isAi: true,
            });
            actionsExecuted++;
            break;
          }
          case "ai_triage": {
            const task = await db.query.tasks.findFirst({
              where: eq(tasks.id, event.taskId),
            });
            if (!task) break;

            const response = await generateAiResponse(
              'You are a triage assistant. Infer the priority of a task from its title and description. Return ONLY one word from: low, medium, high, urgent. No punctuation or explanation.',
              `Title: ${task.title}\nDescription: ${task.description || "(none)"}`,
            );

            const raw = response.trim().toLowerCase();
            const match = raw.match(/\b(low|medium|high|urgent)\b/);
            const priority = (match ? match[1] : "medium") as
              | "low"
              | "medium"
              | "high"
              | "urgent";

            await db
              .update(tasks)
              .set({ priority, updatedAt: new Date() })
              .where(eq(tasks.id, event.taskId));
            actionsExecuted++;
            break;
          }
          case "ai_rewrite": {
            const task = await db.query.tasks.findFirst({
              where: eq(tasks.id, event.taskId),
            });
            if (!task) break;

            const response = await generateAiResponse(
              'You are an editor. Rewrite a task title and description to be clearer and more actionable. Return ONLY valid JSON like { "title": "...", "description": "..." }. Preserve intent; do not invent new information.',
              `Current title: ${task.title}\nCurrent description: ${task.description || "(none)"}`,
            );

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]) as {
                  title?: string;
                  description?: string;
                };
                const setValues: Record<string, unknown> = { updatedAt: new Date() };
                if (typeof parsed.title === "string" && parsed.title.trim()) {
                  setValues.title = parsed.title.trim();
                }
                if (typeof parsed.description === "string") {
                  setValues.description = parsed.description;
                }
                if (Object.keys(setValues).length > 1) {
                  await db
                    .update(tasks)
                    .set(setValues)
                    .where(eq(tasks.id, event.taskId));
                }
              } catch {
                // swallow JSON parse errors, leave task unchanged
              }
            }
            actionsExecuted++;
            break;
          }
        }
      } catch (error) {
        console.error(`Automation action failed (rule: ${rule.name}, action: ${action.type}):`, error);
      }
    }

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      actionsExecuted,
    });
  }

  return results;
}
