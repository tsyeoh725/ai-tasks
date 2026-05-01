import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getBlocksForDateRange } from "@/lib/time-blocker";

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

  const blocks = await getBlocksForDateRange(user.id, new Date(start), new Date(end));
  return NextResponse.json({ blocks });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const { title, category, startTime, endTime, taskId } = await req.json();

    if (!title || !category || !startTime || !endTime) {
      return NextResponse.json(
        { error: "title, category, startTime, and endTime are required" },
        { status: 400 }
      );
    }

    const id = uuid();
    await db.insert(timeBlocks).values({
      id,
      userId: user.id,
      title,
      category,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      taskId: taskId ?? null,
      isLocked: false,
      aiGenerated: false,
    });

    const block = await db.query.timeBlocks.findFirst({
      where: (tb, { eq }) => eq(tb.id, id),
    });

    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    console.error("Create time block error:", error);
    return NextResponse.json(
      { error: "Failed to create time block" },
      { status: 500 }
    );
  }
}
