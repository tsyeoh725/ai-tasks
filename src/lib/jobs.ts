import { db } from "@/db";
import { syncJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// Background job runner. Long-running route handlers create a job row,
// detach the work into a promise, and return the jobId immediately so the
// client can navigate away. The promise updates the row on completion.
//
// This works because Next.js (Node runtime) keeps the process alive while
// promises are still pending; the response has already flushed by then.
// Don't use this for jobs that must survive a deploy — they'll be killed
// mid-flight when the container restarts.

export type JobType =
  | "meta_sync"
  | "monitor_audit"
  | "leads_sheets_sync"
  | "calendar_sync";

export type JobHandle = {
  jobId: string;
  status: "queued";
};

export async function startJob<T>(opts: {
  userId: string;
  type: JobType;
  label?: string;
  payload?: unknown;
  work: () => Promise<T>;
}): Promise<JobHandle> {
  const jobId = uuid();
  await db.insert(syncJobs).values({
    id: jobId,
    userId: opts.userId,
    type: opts.type,
    status: "queued",
    label: opts.label ?? null,
    payload: opts.payload ? JSON.stringify(opts.payload) : null,
    createdAt: new Date(),
  });

  // Fire and forget — don't await. Wrapped in IIFE so failures don't bubble
  // to the request handler.
  void (async () => {
    await db
      .update(syncJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(syncJobs.id, jobId));

    try {
      const result = await opts.work();
      await db
        .update(syncJobs)
        .set({
          status: "succeeded",
          finishedAt: new Date(),
          result: result === undefined ? null : JSON.stringify(result),
        })
        .where(eq(syncJobs.id, jobId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(syncJobs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: message,
        })
        .where(eq(syncJobs.id, jobId));
    }
  })();

  return { jobId, status: "queued" };
}
