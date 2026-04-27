import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc, isNull, isNotNull, or, lt, ne, count, type SQL } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { parsePagination } from "@/lib/api";

// List notifications for the current user
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const tab = url.searchParams.get("tab") || "all";
  const { page, limit, offset } = parsePagination(url.searchParams);

  const conditions: SQL[] = [eq(notifications.userId, user.id!)];
  if (unreadOnly) conditions.push(eq(notifications.read, false));

  const now = new Date();
  const notSnoozed = or(isNull(notifications.snoozedUntil), lt(notifications.snoozedUntil, now));

  if (tab === "archived") {
    conditions.push(isNotNull(notifications.archivedAt));
  } else if (tab === "activity") {
    conditions.push(ne(notifications.type, "message"));
    conditions.push(isNull(notifications.archivedAt));
    if (notSnoozed) conditions.push(notSnoozed);
  } else if (tab === "messages") {
    conditions.push(eq(notifications.type, "message"));
    conditions.push(isNull(notifications.archivedAt));
    if (notSnoozed) conditions.push(notSnoozed);
  } else {
    conditions.push(isNull(notifications.archivedAt));
    if (notSnoozed) conditions.push(notSnoozed);
  }

  const where = and(...conditions);

  const [items, [{ total }], [{ unreadCount }]] = await Promise.all([
    db.query.notifications.findMany({
      where,
      orderBy: [desc(notifications.createdAt)],
      limit,
      offset,
    }),
    db.select({ total: count() }).from(notifications).where(where),
    db.select({ unreadCount: count() }).from(notifications).where(
      and(eq(notifications.userId, user.id!), eq(notifications.read, false), isNull(notifications.archivedAt)),
    ),
  ]);

  return NextResponse.json({ notifications: items, unreadCount, total, page, limit, hasMore: page * limit < total });
}

// Mark notifications as read
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { notificationId, markAllRead } = body;

  if (markAllRead) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, user.id!), eq(notifications.read, false)));
  } else if (notificationId) {
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id!)));
  }

  return NextResponse.json({ success: true });
}
