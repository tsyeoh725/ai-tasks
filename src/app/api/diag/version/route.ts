// ─── Build/runtime diagnostics ───────────────────────────────────────────────
// Returns the git sha baked into the build + the runtime tz info we'd use
// for date parsing. Lets us confirm a deploy actually rolled and that the
// container's tz isn't silently UTC when we expect MYT.
//
// Public endpoint — does not require auth — but returns no sensitive data.
// Mounted under /api/diag/version. (Initially tried _diag but Next.js
// treats underscore-prefixed folders as private/non-routable.)

import { NextResponse } from "next/server";
import { formatNowInZone, resolveUserTimezone } from "@/lib/datetime";

// At build time, GitHub Actions can pass GITHUB_SHA via the Docker build args.
// At runtime we'll fall back to env vars so a manual run still reports
// something meaningful.
const BUILD_SHA =
  process.env.GIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_COMMIT ||
  "unknown";

export async function GET() {
  const containerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const fallbackTz = resolveUserTimezone(undefined);

  return NextResponse.json({
    buildSha: BUILD_SHA.slice(0, 12),
    serverTime: {
      isoUtc: new Date().toISOString(),
      containerTz,
      fallbackUserTz: fallbackTz,
      fallbackTzNow: formatNowInZone(fallbackTz),
      mytNow: formatNowInZone("Asia/Kuala_Lumpur"),
    },
    nodeVersion: process.version,
    env: {
      tz: process.env.TZ || null,
      nodeEnv: process.env.NODE_ENV || null,
    },
  });
}
