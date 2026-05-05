import { db } from "@/db";
import { syncJobs } from "@/db/schema";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

// GET /api/jobs/active
// Returns the user's currently-running jobs plus anything that finished in
// the last 60 seconds (so the UI can flash a "done"/"failed" toast). Older
// finished jobs aren't returned — the badge is for at-a-glance status, not
// history.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const oneMinuteAgo = new Date(Date.now() - 60_000);

  const rows = await db.query.syncJobs.findMany({
    where: and(
      eq(syncJobs.userId, user.id),
      or(
        inArray(syncJobs.status, ["queued", "running"]),
        gte(syncJobs.finishedAt, oneMinuteAgo),
      ),
    ),
    orderBy: [desc(syncJobs.createdAt)],
    limit: 20,
  });

  return NextResponse.json({
    jobs: rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      label: r.label,
      error: r.error,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// DELETE /api/jobs/active — dismiss finished jobs from the user's badge by
// pushing finishedAt > 60s into the past. Running jobs are untouched.
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const twoMinutesAgo = new Date(Date.now() - 120_000);
  await db
    .update(syncJobs)
    .set({ finishedAt: twoMinutesAgo })
    .where(
      and(
        eq(syncJobs.userId, user.id),
        inArray(syncJobs.status, ["succeeded", "failed"]),
        sql`${syncJobs.finishedAt} > ${twoMinutesAgo}`,
      ),
    );

  return NextResponse.json({ success: true });
}
