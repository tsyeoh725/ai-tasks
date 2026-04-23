import { db } from "@/db";
import { accounts, calendarEvents, calendarSyncStatus } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    await db
      .delete(accounts)
      .where(
        and(eq(accounts.userId, user.id), eq(accounts.provider, "google"))
      );

    await db
      .delete(calendarEvents)
      .where(eq(calendarEvents.userId, user.id));

    await db
      .delete(calendarSyncStatus)
      .where(eq(calendarSyncStatus.userId, user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Calendar disconnect error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect calendar" },
      { status: 500 }
    );
  }
}
