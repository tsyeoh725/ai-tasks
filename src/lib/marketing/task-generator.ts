// Task Generator — NEW (no Jarvis counterpart).
// Given a set of detected conditions from a monitor cycle, generate ai-tasks
// rows in the project linked to the brand. Deduplicates against existing open
// tasks with the same title in that project.
import { db } from "@/db";
import { and, eq, ne } from "drizzle-orm";
// The `brands` table has a `projectId` column pointing at the linked ai-tasks project.
import { brands, tasks } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/marketing/logger";

export type DetectedConditionKind =
  | "creative_fatigue"
  | "ctr_below_threshold_3d"
  | "high_cpl_high_spend"
  | "ai_guard_killed"
  | "weekly_leads_below_goal";

export interface DetectedCondition {
  kind: DetectedConditionKind;
  adName?: string;
  adSetName?: string;
  brandName?: string;
  dueDate?: Date;
  // Optional payload for downstream context; serialized into the task description.
  context?: Record<string, unknown>;
}

const PRIORITY_BY_KIND: Record<DetectedConditionKind, "low" | "medium" | "high" | "urgent"> = {
  creative_fatigue: "high",
  ctr_below_threshold_3d: "medium",
  high_cpl_high_spend: "urgent",
  ai_guard_killed: "medium",
  weekly_leads_below_goal: "high",
};

function buildTitle(cond: DetectedCondition): string {
  switch (cond.kind) {
    case "creative_fatigue":
      return `Produce new creative for ${cond.adName ?? "ad"}`;
    case "ctr_below_threshold_3d":
      return `Review copy/targeting for ${cond.adName ?? "ad"}`;
    case "high_cpl_high_spend":
      return `Investigate high-CPL ad: ${cond.adName ?? "ad"}`;
    case "ai_guard_killed":
      return `Replacement ad needed for ${cond.adSetName ?? "ad set"}`;
    case "weekly_leads_below_goal":
      return `Plan campaign refresh for ${cond.brandName ?? "brand"}`;
  }
}

function buildDescription(cond: DetectedCondition): string {
  const contextStr = cond.context ? `\n\nContext:\n${JSON.stringify(cond.context, null, 2)}` : "";
  const base =
    {
      creative_fatigue: `Frequency exceeded the brand's maxFrequency threshold — the audience has likely seen this creative too many times. Ship a fresh concept.`,
      ctr_below_threshold_3d: `CTR has been below threshold for 3 days running. Audit the copy, hook, and targeting.`,
      high_cpl_high_spend: `CPL is above threshold while spend is high — this is burning budget. Investigate ASAP (audience, creative, or landing page).`,
      ai_guard_killed: `AI Guard approved a kill on an ad here. The ad set needs a replacement creative to keep the funnel supplied.`,
      weekly_leads_below_goal: `Weekly leads are below the brand goal. Plan a campaign refresh: new angle, new audiences, or budget redistribution.`,
    }[cond.kind];
  return base + contextStr;
}

export interface TaskGenerationResult {
  created: number;
  skipped: number;
}

/**
 * Given detected conditions, create tasks in the brand's linked project.
 * Deduplicates by exact title against not-done tasks in the same project.
 */
export async function generateTasksFromAdHealth(
  userId: string,
  brandId: string,
  conditions: DetectedCondition[],
): Promise<TaskGenerationResult> {
  if (conditions.length === 0) return { created: 0, skipped: 0 };

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) {
    log("warn", "task_generator", `Brand not found: ${brandId}`);
    return { created: 0, skipped: 0 };
  }

  const linkedProjectId = brand.projectId;
  if (!linkedProjectId) {
    log("warn", "task_generator", `Brand ${brandId} has no linked projectId — skipping`);
    return { created: 0, skipped: 0 };
  }

  // Pull all open tasks in the project once so we can dedupe in memory.
  const openTasks = await db.query.tasks.findMany({
    where: and(eq(tasks.projectId, linkedProjectId), ne(tasks.status, "done")),
    columns: { title: true },
  });
  const existingTitles = new Set(openTasks.map((t) => t.title));

  let created = 0;
  let skipped = 0;

  for (const cond of conditions) {
    const title = buildTitle(cond);
    if (existingTitles.has(title)) {
      skipped++;
      continue;
    }

    await db.insert(tasks).values({
      id: uuid(),
      title,
      description: buildDescription(cond),
      status: "todo",
      priority: PRIORITY_BY_KIND[cond.kind],
      projectId: linkedProjectId,
      createdById: userId,
      assigneeId: userId,
      dueDate: cond.dueDate ?? null,
    });
    existingTitles.add(title); // protect against duplicates within this call
    created++;
  }

  log("info", "task_generator", `Generated tasks for brand ${brandId}`, {
    conditionCount: conditions.length,
    created,
    skipped,
  });

  return { created, skipped };
}
