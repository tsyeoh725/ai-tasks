import { db } from "@/db";
import { calendarSyncStatus } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { syncEventsFromGoogle } from "@/lib/google-calendar";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const result = await syncEventsFromGoogle(user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Calendar sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const status = await db.query.calendarSyncStatus.findFirst({
    where: eq(calendarSyncStatus.userId, user.id),
  });

  if (!status) {
    return NextResponse.json({
      status: "not_connected",
      lastSyncAt: null,
    });
  }

  return NextResponse.json(status);
}
