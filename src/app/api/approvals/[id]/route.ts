import { db } from "@/db";
import { brands, decisionJournal, marketingAuditLog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { executeJournalEntry } from "@/lib/marketing/action-executor";

// POST /api/approvals/[id]  { verdict: "approved" | "rejected", note? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = (await req.json()) as { verdict?: string; note?: string };
  const { verdict, note } = body;

  if (verdict !== "approved" && verdict !== "rejected") {
    return NextResponse.json(
      { error: "verdict must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }

  const entry = await db.query.decisionJournal.findFirst({
    where: eq(decisionJournal.id, id),
  });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  // Ownership: entry.brandId must belong to the user.
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, entry.brandId) });
  if (!brand || brand.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (entry.guardVerdict !== "pending") {
    return NextResponse.json({ error: "Entry is not pending" }, { status: 400 });
  }

  if (verdict === "rejected") {
    await db
      .update(decisionJournal)
      .set({
        guardVerdict: "rejected",
        guardReasoning: note ?? "Rejected by human",
      })
      .where(eq(decisionJournal.id, id));

    await db.insert(marketingAuditLog).values({
      id: uuid(),
      userId: user.id,
      eventType: "approval_rejected",
      entityType: "decision_journal",
      entityId: id,
      payload: note ? JSON.stringify({ note }) : null,
      level: "info",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, verdict: "rejected" });
  }

  // verdict === "approved"
  await db
    .update(decisionJournal)
    .set({ guardVerdict: "approved", guardReasoning: note ?? "Approved by human" })
    .where(eq(decisionJournal.id, id));

  // Execute the recommendation (manualApproval bypasses toggle checks).
  const result = await executeJournalEntry(id, { manualApproval: true });

  await db.insert(marketingAuditLog).values({
    id: uuid(),
    userId: user.id,
    eventType: result.success ? "approval_approved_and_executed" : "approval_approved_execution_failed",
    entityType: "decision_journal",
    entityId: id,
    payload: JSON.stringify(result),
    level: result.success ? "info" : "error",
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true, verdict: "approved", result });
}
