import { db } from "@/db";
import { decisionJournal } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";

// GET /api/journal?brandId=&verdict=&action=&startDate=&endDate=&limit=
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const verdict = searchParams.get("verdict");
  const action = searchParams.get("action");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  // Scope to brands accessible in the active workspace.
  const ws = await resolveWorkspaceForUser(user.id);
  const userBrands = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true },
  });
  const brandIds = userBrands.map((b) => b.id);
  if (brandIds.length === 0) {
    return NextResponse.json([]);
  }

  if (brandId && brandId !== "all" && !brandIds.includes(brandId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conditions = [
    brandId && brandId !== "all"
      ? eq(decisionJournal.brandId, brandId)
      : inArray(decisionJournal.brandId, brandIds),
  ];
  if (verdict && verdict !== "all") {
    if (verdict === "approved" || verdict === "rejected" || verdict === "pending") {
      conditions.push(eq(decisionJournal.guardVerdict, verdict));
    }
  }
  if (action && action !== "all") {
    if (action === "kill" || action === "pause" || action === "boost_budget" || action === "duplicate") {
      conditions.push(eq(decisionJournal.recommendation, action));
    }
  }
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) conditions.push(gte(decisionJournal.createdAt, start));
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) {
      // endDate is a date string like "2026-05-04" → midnight UTC. Include the
      // full day so rows created later on the same date aren't dropped.
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(decisionJournal.createdAt, end));
    }
  }

  const entries = await db.query.decisionJournal.findMany({
    where: and(...conditions),
    with: {
      brand: { columns: { id: true, name: true } },
      ad: { columns: { id: true, name: true, metaAdId: true } },
    },
    orderBy: (d, { desc }) => [desc(d.createdAt)],
    limit,
  });

  return NextResponse.json(entries);
}
