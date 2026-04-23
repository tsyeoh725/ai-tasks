import { db } from "@/db";
import { timeBlocks, accounts } from "@/db/schema";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { pushEventToGoogle, deleteGoogleEvent } from "@/lib/google-calendar";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Check Google account is linked before doing any work — saves looping over
  // candidates only to fail mid-way with a 400.
  const googleAccount = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, user.id), eq(accounts.provider, "google")),
    columns: { id: true },
  });
  if (!googleAccount) {
    return NextResponse.json(
      { error: "Google Calendar not connected. Connect in Settings first." },
      { status: 400 }
    );
  }

  let blockIds: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.blockIds)) {
      blockIds = body.blockIds.filter((v: unknown): v is string => typeof v === "string");
    }
  } catch {
    // Empty body is acceptable
  }

  // Fetch candidate blocks: either the explicit list, or all non-pushed blocks
  // in the next 14 days that are AI-generated or locked.
  let candidates: Awaited<ReturnType<typeof db.query.timeBlocks.findMany>>;

  if (blockIds && blockIds.length > 0) {
    candidates = await db.query.timeBlocks.findMany({
      where: and(
        eq(timeBlocks.userId, user.id),
        or(eq(timeBlocks.aiGenerated, true), eq(timeBlocks.isLocked, true))
      ),
    });
    const idSet = new Set(blockIds);
    candidates = candidates.filter((b) => idSet.has(b.id));
  } else {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    candidates = await db.query.timeBlocks.findMany({
      where: and(
        eq(timeBlocks.userId, user.id),
        or(eq(timeBlocks.aiGenerated, true), eq(timeBlocks.isLocked, true)),
        gte(timeBlocks.startTime, now),
        lte(timeBlocks.startTime, windowEnd)
      ),
    });
  }

  let pushed = 0;
  let skipped = 0;
  const failed: Array<{ blockId: string; reason: string }> = [];
  let googleNotLinked = false;

  for (const block of candidates) {
    try {
      if (block.googleEventId) {
        try {
          await deleteGoogleEvent(user.id, block.googleEventId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("No Google account linked")) {
            googleNotLinked = true;
            break;
          }
          // Non-fatal: continue with re-push attempt even if deletion fails
          // (e.g. the event may have already been removed from Google Calendar).
        }
      }

      const googleEventId = await pushEventToGoogle(user.id, {
        title: block.title,
        description: "Scheduled via AI Tasks",
        startTime: block.startTime,
        endTime: block.endTime,
      });

      await db
        .update(timeBlocks)
        .set({ googleEventId })
        .where(and(eq(timeBlocks.id, block.id), eq(timeBlocks.userId, user.id)));

      pushed += 1;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (reason.includes("No Google account linked")) {
        googleNotLinked = true;
        break;
      }
      failed.push({ blockId: block.id, reason });
    }
  }

  if (googleNotLinked) {
    return NextResponse.json(
      { error: "Google Calendar not connected. Connect in Settings first." },
      { status: 400 }
    );
  }

  skipped = candidates.length - pushed - failed.length;

  return NextResponse.json({ pushed, failed, skipped });
}
