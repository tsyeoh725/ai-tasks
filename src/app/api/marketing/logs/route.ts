import { db } from "@/db";
import { marketingAuditLog } from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/session";

// GET /api/marketing/logs?level=&sessionId=&startDate=&endDate=&limit=&offset=
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level");
  const sessionId = searchParams.get("sessionId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

  const conditions = [eq(marketingAuditLog.userId, user.id)];

  if (level && (level === "info" || level === "warn" || level === "error" || level === "debug")) {
    conditions.push(eq(marketingAuditLog.level, level));
  }
  if (sessionId) conditions.push(eq(marketingAuditLog.sessionId, sessionId));
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime())) conditions.push(gte(marketingAuditLog.createdAt, start));
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime())) conditions.push(lte(marketingAuditLog.createdAt, end));
  }

  const logs = await db.query.marketingAuditLog.findMany({
    where: and(...conditions),
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit,
    offset,
  });

  return NextResponse.json({ logs, limit, offset });
}
