import { db } from "@/db";
import { agentMemory, brands, decisionJournal, marketingAuditLog, metaAds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { executeJournalEntry } from "@/lib/marketing/action-executor";
import { canAccessBrand } from "@/lib/brand-access";

// POST /api/approvals/[id]
//   { verdict: "approved" | "rejected",
//     note?: string,            // legacy free-text reason on the journal
//     userRemark?: string,      // operator's note for the AI to learn from
//     overrideBudget?: number } // boost_budget only — custom new amount
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = (await req.json()) as {
    verdict?: string;
    note?: string;
    userRemark?: string;
    overrideBudget?: number;
  };
  const { verdict, note, userRemark, overrideBudget } = body;

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

  // Access: entry.brandId must be reachable from the user's workspace.
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, entry.brandId) });
  if (!brand || !(await canAccessBrand(brand, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (entry.guardVerdict !== "pending") {
    return NextResponse.json({ error: "Entry is not pending" }, { status: 400 });
  }

  // Stash the user's remark into agent_memory (memoryType=preference) so the
  // AI Guard's existing memory loader (core-monitor.ts:255 → claude-guard
  // prompt "Brand Memory & Learning History") picks it up next cycle. Scoped
  // to brand — broad enough to catch related campaigns without tying the
  // note to one ad id that may be paused tomorrow.
  const remark = userRemark?.trim();
  if (remark && remark.length > 0) {
    let adName = "";
    if (entry.adId) {
      const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, entry.adId) });
      adName = (ad as unknown as { name?: string } | null)?.name ?? "";
    }
    const header = `Operator ${verdict} ${entry.recommendation}${adName ? ` on "${adName}"` : ""}`;
    await db.insert(agentMemory).values({
      id: uuid(),
      userId: user.id,
      brandId: entry.brandId,
      memoryType: "preference",
      content: `${header}: ${remark}`,
      metadata: JSON.stringify({
        source: "approval_remark",
        journalId: id,
        verdict,
        action: entry.recommendation,
        overrideBudget: overrideBudget ?? null,
      }),
      createdAt: new Date(),
    });
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
      payload: JSON.stringify({ note: note ?? null, userRemark: remark ?? null }),
      level: "info",
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, verdict: "rejected" });
  }

  // verdict === "approved"
  // Persist the operator's custom budget (boost_budget only) onto the journal
  // row before executing so executeJournalEntry → executeBoostBudget reads it.
  // Negative/zero is treated as "no override" by the executor; we still allow
  // a value below current (the user explicitly asked for that).
  const overrideToPersist =
    entry.recommendation === "boost_budget" &&
    typeof overrideBudget === "number" &&
    Number.isFinite(overrideBudget) &&
    overrideBudget > 0
      ? overrideBudget
      : null;

  await db
    .update(decisionJournal)
    .set({
      guardVerdict: "approved",
      guardReasoning: note ?? "Approved by human",
      userOverrideBudget: overrideToPersist,
    })
    .where(eq(decisionJournal.id, id));

  // Execute the recommendation (manualApproval bypasses toggle checks).
  const result = await executeJournalEntry(id, { manualApproval: true });

  await db.insert(marketingAuditLog).values({
    id: uuid(),
    userId: user.id,
    eventType: result.success ? "approval_approved_and_executed" : "approval_approved_execution_failed",
    entityType: "decision_journal",
    entityId: id,
    payload: JSON.stringify({
      result,
      overrideBudget: overrideToPersist,
      userRemark: remark ?? null,
    }),
    level: result.success ? "info" : "error",
    createdAt: new Date(),
  });

  return NextResponse.json({ success: true, verdict: "approved", result });
}
