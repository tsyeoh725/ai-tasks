// ─── Timezone-aware datetime parsing for AI tools ────────────────────────────
//
// The AI passes datetime strings into tools like createTask. Without explicit
// tz handling, `new Date("2026-05-07")` parses as UTC midnight which displays
// as 08:00 in MYT — giving us tasks dated "07/05 at 8 AM" when the user
// asked for "later at 4pm". Two failure modes we need to handle:
//
//   (a) Schema only accepted YYYY-MM-DD, so the AI couldn't pass a time at all
//   (b) Even with date-only, UTC interpretation drifts by the user's offset
//
// This module provides parseDueDate(input, userTz) which:
//   - Accepts YYYY-MM-DD, full ISO 8601, or ISO with explicit offset
//   - Treats bare strings as wall-clock in the user's timezone
//   - Defaults bare dates to 09:00 user-local (start of typical workday)
//   - Returns a UTC Date suitable for `db.insert`

const DEFAULT_HOUR_FOR_DATE_ONLY = 9; // 09:00 — start of typical workday

/**
 * Parse an AI-supplied datetime string into a UTC Date.
 *
 * Accepts:
 *   "2026-05-07"                   → 09:00 in userTz that day
 *   "2026-05-07T16:00"             → 16:00 in userTz (no offset assumed)
 *   "2026-05-07T16:00:00"          → 16:00 in userTz
 *   "2026-05-07T16:00:00+08:00"    → preserved as-is (offset given)
 *   "2026-05-07T08:00:00Z"         → preserved as-is (UTC)
 *
 * Returns null on any parse failure so callers can surface a clean error
 * instead of silently storing Invalid Date.
 */
export function parseDueDate(input: string, userTz: string): Date | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Already has timezone info (Z suffix or ±HH:MM offset) — `new Date` handles
  // it correctly without our help.
  if (
    trimmed.endsWith("Z") ||
    /[+-]\d{2}:?\d{2}$/.test(trimmed)
  ) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // Date-only — anchor to 09:00 user-local so "due Friday" doesn't show up
  // as 8am the previous day in some timezones.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return wallClockToUtc(
      `${trimmed}T${String(DEFAULT_HOUR_FOR_DATE_ONLY).padStart(2, "0")}:00:00`,
      userTz,
    );
  }

  // Datetime without tz suffix (e.g. "2026-05-07T16:00" or "2026-05-07T16:00:00")
  // — treat as wall-clock in user's tz.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const padded = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    return wallClockToUtc(padded, userTz);
  }

  // SL-7: strict mode. The two regexes above accept every shape we want to
  // support. Anything else is malformed — return null so the caller surfaces
  // a parse error to the model (which retries with a proper format) instead
  // of silently producing wrong dates via `new Date("June 7")` etc.
  return null;
}

/**
 * Convert a wall-clock ISO string (no offset) to a UTC Date, treating the
 * input as if it were displayed on a clock in the given timezone.
 *
 * Algorithm:
 *   1. Parse input as if it were UTC (a "ghost" instant)
 *   2. Format that ghost in the target tz to see what wall-clock it reads
 *   3. The diff between the ghost-as-UTC and ghost-displayed-in-tz is the
 *      tz offset at that moment — apply it to recover the true UTC instant
 *
 * Handles DST transitions correctly because the offset is computed at the
 * specific instant, not from a static lookup. Half-hour offsets (India,
 * Newfoundland) and 45-min offsets (Nepal) work the same way.
 */
function wallClockToUtc(iso: string, tz: string): Date {
  const ghost = new Date(`${iso}Z`);
  if (isNaN(ghost.getTime())) return new Date(NaN);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(ghost);

  const get = (type: string) => {
    const part = parts.find((p) => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  // Some Intl implementations emit "24" for midnight — normalize.
  const hour = get("hour") % 24;

  const ghostInZoneAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );

  const offsetMs = ghost.getTime() - ghostInZoneAsUtc;
  return new Date(ghost.getTime() + offsetMs);
}

// Legacy schema default — every userPreferences row created before
// 2026-05-07 has this even though most users are in MYT. Treating it as
// unset (instead of trusting it) is a deliberate tradeoff: a genuine NY
// user gets the wrong tz once and fixes it via Settings → Schedule;
// silently giving every existing user 12-hour-off task times was worse.
const LEGACY_SCHEMA_DEFAULT_TZ = "America/New_York";

/**
 * Resolve the timezone to use for a user.
 *
 * Precedence:
 *   1. Their saved preference (if non-empty AND not the legacy schema default)
 *   2. Container's runtime tz via Intl (set via TZ env in the Dockerfile)
 *   3. JARVIS_DEFAULT_TZ env var (escape hatch for non-Docker deployments)
 *   4. UTC
 */
export function resolveUserTimezone(prefsTimezone: string | undefined | null): string {
  if (prefsTimezone && prefsTimezone.length > 0 && prefsTimezone !== LEGACY_SCHEMA_DEFAULT_TZ) {
    return prefsTimezone;
  }
  try {
    const containerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (containerTz && containerTz !== "UTC") return containerTz;
  } catch {
    /* fall through */
  }
  return process.env.JARVIS_DEFAULT_TZ || "UTC";
}

/**
 * Format the current moment as wall-clock in the given tz, suitable for
 * dropping into an AI system prompt so the model can reason about "later",
 * "tomorrow morning", "EOD", etc.
 *
 * Example: "2026-05-07 14:44 (Asia/Kuala_Lumpur, UTC+08:00)"
 */
export function formatNowInZone(tz: string): string {
  const now = new Date();
  const dt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  // "2026-05-07, 14:44" — drop the comma for readability
  const cleaned = dt.replace(",", "");

  // Compute the offset string (+HH:MM) for clarity. Reusing the wall-clock
  // algo: format `now` in tz, then diff against UTC.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => {
    const p = parts.find((x) => x.type === t);
    return p ? parseInt(p.value, 10) : 0;
  };
  const tzAsUtcMs = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  const offsetMin = Math.round((tzAsUtcMs - now.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mm = String(absMin % 60).padStart(2, "0");

  return `${cleaned} (${tz}, UTC${sign}${hh}:${mm})`;
}
