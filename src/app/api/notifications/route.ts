import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, desc, isNull, isNotNull, or, lt, ne, type SQL } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

// List notifications for the current user
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const tab = url.searchParams.get("tab") || "all";
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const conditions: SQL[] = [eq(notifications.userId, user.id!)];
  if (unreadOnly) {
    conditions.push(eq(notifications.read, false));
  }

  const now = new Date();
  const notSnoozed = or(
    isNull(notifications.snoozedUntil),
    lt(notifications.snoozedUntil, now),
  );

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
    // default: all non-archived + not snoozed
    conditions.push(isNull(notifications.archivedAt));
    if (notSnoozed) conditions.push(notSnoozed);
  }

  const items = await db.query.notifications.findMany({
    where: and(...conditions),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });

  const unreadCount = await db
    .select({ count: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id!),
        eq(notifications.read, false),
        isNull(notifications.archivedAt),
      ),
    );

  return NextResponse.json({
    notifications: items,
    unreadCount: unreadCount.length,
  });
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
