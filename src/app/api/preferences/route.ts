import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

const DEFAULTS = {
  workStartTime: "09:00",
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
  workEndTime: "17:00",
  timezone: "America/New_York",
  preferredBlockDuration: 60,
  focusTimePreference: "morning" as const,
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, user.id),
  });

  if (!prefs) {
    return NextResponse.json({ preferences: DEFAULTS });
  }

  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const {
      workStartTime,
      lunchStartTime,
      lunchEndTime,
      workEndTime,
      timezone,
      focusTimePreference,
    } = body;

    const existing = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    });

    if (existing) {
      await db
        .update(userPreferences)
        .set({
          workStartTime: workStartTime ?? existing.workStartTime,
          lunchStartTime: lunchStartTime ?? existing.lunchStartTime,
          lunchEndTime: lunchEndTime ?? existing.lunchEndTime,
          workEndTime: workEndTime ?? existing.workEndTime,
          timezone: timezone ?? existing.timezone,
          focusTimePreference:
            focusTimePreference ?? existing.focusTimePreference,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, user.id));
    } else {
      await db.insert(userPreferences).values({
        id: uuid(),
        userId: user.id,
        workStartTime: workStartTime ?? DEFAULTS.workStartTime,
        lunchStartTime: lunchStartTime ?? DEFAULTS.lunchStartTime,
        lunchEndTime: lunchEndTime ?? DEFAULTS.lunchEndTime,
        workEndTime: workEndTime ?? DEFAULTS.workEndTime,
        timezone: timezone ?? DEFAULTS.timezone,
        focusTimePreference:
          focusTimePreference ?? DEFAULTS.focusTimePreference,
      });
    }

    const prefs = await db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    });

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error("Update preferences error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
