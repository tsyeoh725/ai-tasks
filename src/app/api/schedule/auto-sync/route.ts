import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { autoSyncSchedule } from "@/lib/time-blocker";

// Auto-sync: places every assigned task on its due date (or today if overdue).
// Clears existing AI-generated non-locked blocks first to avoid duplicates.
export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  try {
    const { blocks, warnings } = await autoSyncSchedule(user.id);
    return NextResponse.json({ blocks, warnings, count: blocks.length });
  } catch (error) {
    console.error("Auto-sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync schedule" },
      { status: 500 }
    );
  }
}
