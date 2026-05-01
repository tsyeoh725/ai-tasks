import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { parsePagination } from "@/lib/api";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") as "task" | "project" | "team" | null;
  const entityId = url.searchParams.get("entityId");
  const { page, limit, offset } = parsePagination(url.searchParams);

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  const where = and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId));

  const [items, [{ total }]] = await Promise.all([
    db.query.activityLog.findMany({
      where,
      with: { user: { columns: { id: true, name: true, email: true } } },
      orderBy: [desc(activityLog.createdAt)],
      limit,
      offset,
    }),
    db.select({ total: count() }).from(activityLog).where(where),
  ]);

  return NextResponse.json({ activities: items, total, page, limit, hasMore: page * limit < total });
}
