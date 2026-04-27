import { db } from "@/db";
import { workflowChains, workflowChainSteps, workflowChainRuns, tasks, notifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

type ChainRun = typeof workflowChainRuns.$inferSelect;
type ChainStep = typeof workflowChainSteps.$inferSelect;

async function createTaskForStep(step: ChainStep, projectId: string, createdById: string): Promise<string> {
  const taskId = uuid();
  await db.insert(tasks).values({
    id: taskId,
    title: step.taskTitle,
    description: step.taskDescription ?? null,
    status: "todo",
    priority: "medium",
    projectId,
    assigneeId: step.assigneeId ?? null,
    createdById,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return taskId;
}

async function notifyAssignee(step: ChainStep, projectId: string, createdById: string) {
  if (!step.assigneeId) return;
  await db.insert(notifications).values({
    id: uuid(),
    userId: step.assigneeId,
    type: "assigned",
    title: "New workflow step assigned",
    message: `You have been assigned: "${step.taskTitle}"`,
    entityType: "project",
    entityId: projectId,
    read: false,
    createdAt: new Date(),
  });
}

export async function advanceChain(runId: string, triggeredById: string) {
  const run = await db.query.workflowChainRuns.findFirst({
    where: eq(workflowChainRuns.id, runId),
  }) as ChainRun | undefined;

  if (!run || run.status !== "running") return;

  const chain = await db.query.workflowChains.findFirst({
    where: eq(workflowChains.id, run.chainId),
    with: { steps: true, project: true },
  });

  if (!chain || !chain.isActive) return;

  const steps = (chain.steps as ChainStep[]).sort((a, b) => a.sortOrder - b.sortOrder);

  // Find the next step after the current one
  let nextStep: ChainStep | undefined;
  if (!run.currentStepId) {
    nextStep = steps[0];
  } else {
    const currentIdx = steps.findIndex((s) => s.id === run.currentStepId);
    nextStep = steps[currentIdx + 1];
  }

  if (!nextStep) {
    // Chain complete
    await db.update(workflowChainRuns)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(workflowChainRuns.id, runId));
    return;
  }

  // Execute the step action
  const projectId = chain.projectId;
  const log = JSON.parse(run.log ?? "[]") as unknown[];

  if (nextStep.action === "create_task") {
    const taskId = await createTaskForStep(nextStep, projectId, triggeredById);
    log.push({ stepId: nextStep.id, action: "create_task", taskId, ts: new Date().toISOString() });
    await notifyAssignee(nextStep, projectId, triggeredById);
  } else if (nextStep.action === "notify") {
    await notifyAssignee(nextStep, projectId, triggeredById);
    log.push({ stepId: nextStep.id, action: "notify", ts: new Date().toISOString() });
  } else if (nextStep.action === "upload_to_drive" || nextStep.action === "ai_verify_drive") {
    // These are async operations — mark step as pending and return
    log.push({ stepId: nextStep.id, action: nextStep.action, status: "pending", ts: new Date().toISOString() });
  }

  await db.update(workflowChainRuns)
    .set({ currentStepId: nextStep.id, log: JSON.stringify(log) })
    .where(eq(workflowChainRuns.id, runId));

  // If this step requires manual trigger (approval), pause the chain
  if (nextStep.trigger === "approved" || nextStep.trigger === "manual") {
    await db.update(workflowChainRuns)
      .set({ status: "paused" })
      .where(eq(workflowChainRuns.id, runId));
  }
}

// Called when a task is completed — checks if it's a step in any running chain
export async function evaluateChainsForTask(taskId: string, completedById: string) {
  // Find runs where the current step's task matches this task title
  // (We match by taskId stored in step actionConfig if present)
  const runs = await db.query.workflowChainRuns.findMany({
    where: and(
      eq(workflowChainRuns.status, "running"),
    ),
  });

  for (const run of runs) {
    if (!run.currentStepId) continue;
    const step = await db.query.workflowChainSteps.findFirst({
      where: eq(workflowChainSteps.id, run.currentStepId),
    }) as ChainStep | undefined;

    if (!step) continue;
    const config = JSON.parse(step.actionConfig ?? "{}") as { taskId?: string };
    if (config.taskId === taskId && step.trigger === "completed") {
      await advanceChain(run.id, completedById);
    }
  }
}

export async function startChain(chainId: string, createdById: string): Promise<string> {
  const runId = uuid();
  await db.insert(workflowChainRuns).values({
    id: runId,
    chainId,
    status: "running",
    log: "[]",
    startedAt: new Date(),
  });
  await advanceChain(runId, createdById);
  return runId;
}
