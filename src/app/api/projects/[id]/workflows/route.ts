import { db } from "@/db";
import { workflowChains, workflowChainSteps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { canAccessProject } from "@/lib/access";
import { v4 as uuid } from "uuid";
import { startChain } from "@/lib/workflow-chains";

// GET /api/projects/[id]/workflows
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const chains = await db.query.workflowChains.findMany({
    where: eq(workflowChains.projectId, id),
    with: { steps: true, runs: true },
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  });

  return NextResponse.json(chains);
}

// POST /api/projects/[id]/workflows — create chain (+ steps) and optionally start it
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, description, steps = [], startNow = false } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const chainId = uuid();
  const now = new Date();
  await db.insert(workflowChains).values({
    id: chainId,
    projectId: id,
    name,
    description: description ?? null,
    isActive: true,
    createdById: user.id,
    createdAt: now,
    updatedAt: now,
  });

  if (steps.length > 0) {
    await db.insert(workflowChainSteps).values(
      steps.map((s: {
        taskTitle: string;
        taskDescription?: string;
        assigneeId?: string;
        trigger?: string;
        delayHours?: number;
        action?: string;
        actionConfig?: Record<string, unknown>;
        sortOrder?: number;
      }, i: number) => ({
        id: uuid(),
        chainId,
        sortOrder: s.sortOrder ?? i,
        taskTitle: s.taskTitle,
        taskDescription: s.taskDescription ?? null,
        assigneeId: s.assigneeId ?? null,
        trigger: s.trigger ?? "completed",
        delayHours: s.delayHours ?? 0,
        action: s.action ?? "create_task",
        actionConfig: JSON.stringify(s.actionConfig ?? {}),
        createdAt: now,
      }))
    );
  }

  let runId: string | null = null;
  if (startNow) {
    runId = await startChain(chainId, user.id);
  }

  const chain = await db.query.workflowChains.findFirst({
    where: eq(workflowChains.id, chainId),
    with: { steps: true },
  });

  return NextResponse.json({ ...chain, runId }, { status: 201 });
}
