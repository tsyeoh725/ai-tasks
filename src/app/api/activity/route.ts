import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

// Get activity for an entity
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") as "task" | "project" | "team" | null;
  const entityId = url.searchParams.get("entityId");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  const items = await db.query.activityLog.findMany({
    where: and(
      eq(activityLog.entityType, entityType),
      eq(activityLog.entityId, entityId),
    ),
    with: {
      user: { columns: { id: true, name: true, email: true } },
    },
    orderBy: [desc(activityLog.createdAt)],
    limit,
  });

  return NextResponse.json({ activities: items });
}
