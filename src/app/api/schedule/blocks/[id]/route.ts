import { db } from "@/db";
import { timeBlocks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { confirmBlock } from "@/lib/time-blocker";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    const body = await req.json();
    const { isLocked, title, startTime, endTime, category } = body;

    // If isLocked is being set to true, use confirmBlock
    if (isLocked === true) {
      const result = await confirmBlock(id);
      return NextResponse.json({ block: result });
    }

    // Otherwise, do a direct update
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (startTime !== undefined) updates.startTime = new Date(startTime);
    if (endTime !== undefined) updates.endTime = new Date(endTime);
    if (category !== undefined) updates.category = category;
    if (isLocked !== undefined) updates.isLocked = isLocked;

    await db
      .update(timeBlocks)
      .set(updates)
      .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, user.id)));

    const block = await db.query.timeBlocks.findFirst({
      where: (tb, { eq: e }) => e(tb.id, id),
    });

    return NextResponse.json({ block });
  } catch (error) {
    console.error("Update time block error:", error);
    return NextResponse.json(
      { error: "Failed to update time block" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  try {
    await db
      .delete(timeBlocks)
      .where(and(eq(timeBlocks.id, id), eq(timeBlocks.userId, user.id)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete time block error:", error);
    return NextResponse.json(
      { error: "Failed to delete time block" },
      { status: 500 }
    );
  }
}
