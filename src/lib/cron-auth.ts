// Shared cron authorization. Used by /api/cron/monitor and /api/cron/weekly.
//
// Why this lives in its own file: the previous inline `if (envSecret && header === envSecret)`
// pattern was duplicated in two routes, used a non-constant-time comparison, and
// silently failed when CRON_SECRET wasn't set (the in-process scheduler still
// fired its POSTs with `x-cron-secret: ""` which the route rejected → safety-net
// crons silently disabled in misconfigured deployments).
//
// SL-6 (crypto comparison): use `crypto.timingSafeEqual` after a length check.
// SL-1 (multi-tenancy): cron-trusted callers operate as null-userId across all
// brands; session-trusted callers are scoped to their own brands.

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "./session";

export type CronAuthResult =
  | { userId: string; cron: false }
  | { userId: null; cron: true }
  | { error: NextResponse };

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function authorizeCron(req: Request): Promise<CronAuthResult> {
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;

  // Cron secret path — only valid when env is set AND header is supplied AND
  // both match in constant time. Empty / missing on either side falls through
  // to session auth.
  if (envSecret && cronSecretHeader && constantTimeEquals(cronSecretHeader, envSecret)) {
    return { userId: null, cron: true };
  }

  const user = await getSessionUser();
  if (user) return { userId: user.id, cron: false };

  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}
