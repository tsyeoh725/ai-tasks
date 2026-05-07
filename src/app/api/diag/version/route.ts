// ─── Build/runtime diagnostics ───────────────────────────────────────────────
// Returns the git sha baked into the build + the runtime tz info we'd use
// for date parsing. Lets us confirm a deploy actually rolled and that the
// container's tz isn't silently UTC when we expect MYT.
//
// SL-11: anonymous callers see only `{ buildSha, ok }` — node version and TZ
// env are admin-only because they're useful for CVE targeting / fingerprinting.
// Admins (ADMIN_USER_IDS allowlist) get the full payload.

import { NextResponse } from "next/server";
import { formatNowInZone, resolveUserTimezone } from "@/lib/datetime";
import { getSessionUser, isAdminUser } from "@/lib/session";

// At build time, GitHub Actions can pass GITHUB_SHA via the Docker build args.
// At runtime we'll fall back to env vars so a manual run still reports
// something meaningful.
const BUILD_SHA =
  process.env.GIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_COMMIT ||
  "unknown";

export async function GET() {
  const buildSha = BUILD_SHA.slice(0, 12);
  const user = await getSessionUser();

  // Anonymous / non-admin: minimum viable payload. Build SHA alone is not
  // useful for CVE targeting (no node/runtime info attached).
  if (!isAdminUser(user)) {
    return NextResponse.json({ ok: true, buildSha });
  }

  const containerTz =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
  const fallbackTz = resolveUserTimezone(undefined);

  return NextResponse.json({
    ok: true,
    buildSha,
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
