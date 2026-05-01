import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { generateDaySchedule } from "@/lib/time-blocker";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const { date } = await req.json();

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    // Parse date consistently in server local timezone
    // If YYYY-MM-DD: construct as local midnight of that day
    // If full ISO: use as-is
    let targetDate: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split("-").map(Number);
      targetDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    } else {
      targetDate = new Date(date);
    }

    const blocks = await generateDaySchedule(user.id, targetDate);
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("Schedule generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 }
    );
  }
}
