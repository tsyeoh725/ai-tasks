import { db } from "@/db";
import { approvals } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { createNotification } from "@/lib/notifications";

// List approvals for a task
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const result = await db.query.approvals.findMany({
    where: eq(approvals.taskId, id),
    with: {
      requestedBy: { columns: { id: true, name: true } },
      approver: { columns: { id: true, name: true } },
    },
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });

  return NextResponse.json({ approvals: result });
}

// Request approval
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { approverId } = await req.json();

  if (!approverId) {
    return NextResponse.json(
      { error: "approverId is required" },
      { status: 400 }
    );
  }

  const approval = {
    id: uuid(),
    taskId: id,
    requestedById: user.id!,
    approverId,
    status: "pending" as const,
  };

  await db.insert(approvals).values(approval);

  // Notify the approver
  await createNotification({
    userId: approverId,
    type: "assigned",
    title: `${user.name} requested your approval`,
    message: `You have a new approval request for a task.`,
    entityType: "task",
    entityId: id,
  });

  return NextResponse.json(approval);
}

// Respond to approval
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  await params;

  const { approvalId, status, comment } = await req.json();

  if (!approvalId || !status) {
    return NextResponse.json(
      { error: "approvalId and status are required" },
      { status: 400 }
    );
  }

  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "Status must be 'approved' or 'rejected'" },
      { status: 400 }
    );
  }

  // Fetch the approval
  const existing = await db.query.approvals.findFirst({
    where: eq(approvals.id, approvalId),
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Approval not found" },
      { status: 404 }
    );
  }

  // Only the approver can respond
  if (existing.approverId !== user.id) {
    return NextResponse.json(
      { error: "Only the assigned approver can respond" },
      { status: 403 }
    );
  }

  if (existing.status !== "pending") {
    return NextResponse.json(
      { error: "Approval has already been responded to" },
      { status: 400 }
    );
  }

  await db
    .update(approvals)
    .set({
      status,
      comment: comment || null,
      respondedAt: new Date(),
    })
    .where(eq(approvals.id, approvalId));

  // Notify the requester
  await createNotification({
    userId: existing.requestedById,
    type: "status_changed",
    title: `${user.name} ${status} your approval request`,
    message: comment || undefined,
    entityType: "task",
    entityId: existing.taskId,
  });

  const updated = await db.query.approvals.findFirst({
    where: eq(approvals.id, approvalId),
  });

  return NextResponse.json(updated);
}
