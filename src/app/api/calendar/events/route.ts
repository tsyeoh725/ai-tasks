import { db } from "@/db";
import { calendarEvents, timeBlocks } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query parameters are required" },
      { status: 400 }
    );
  }

  const startDate = new Date(start);
  const endDate = new Date(end);

  const [events, blocks] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, user.id),
          gte(calendarEvents.startTime, startDate),
          lte(calendarEvents.endTime, endDate)
        )
      ),
    db
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.userId, user.id),
          gte(timeBlocks.startTime, startDate),
          lte(timeBlocks.endTime, endDate)
        )
      ),
  ]);

  const merged = [
    ...events.map((e) => ({ ...e, type: "event" as const })),
    ...blocks.map((b) => ({ ...b, type: "block" as const })),
  ].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return NextResponse.json({ items: merged });
}
