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
    const d = wallClockToUtc(
      `${trimmed}T${String(DEFAULT_HOUR_FOR_DATE_ONLY).padStart(2, "0")}:00:00`,
      userTz,
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // Datetime without tz suffix (e.g. "2026-05-07T16:00" or "2026-05-07T16:00:00")
  // — treat as wall-clock in user's tz.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const padded = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    const d = wallClockToUtc(padded, userTz);
    return isNaN(d.getTime()) ? null : d;
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
export function wallClockToUtc(iso: string, tz: string): Date {
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
 * Returns the UTC Date representing wall-clock midnight in `tz` for the
 * given instant. SL-7: use this instead of `new Date(d.getFullYear(),
 * d.getMonth(), d.getDate())` which always uses the *server's* tz —
 * "today" for a user in Asia/Kolkata starts 2.5 h late when the server
 * is in MYT.
 *
 * Example: when=2026-05-07T03:00:00Z, tz="Asia/Kuala_Lumpur" → that's
 * 11 AM on the 7th locally → returns 2026-05-06T16:00:00Z (= midnight
 * Mon May 7 in MYT).
 */
export function startOfDayInZone(tz: string, when: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(when);
  // en-CA outputs "YYYY-MM-DD"
  return wallClockToUtc(`${ymd}T00:00:00`, tz);
}

/** Wall-clock midnight + 24h in `tz`. */
export function endOfDayInZone(tz: string, when: Date = new Date()): Date {
  return new Date(startOfDayInZone(tz, when).getTime() + 86400_000);
}

/**
 * Add `days` calendar days to `when`, anchored to wall-clock midnight in
 * `tz`. So `addDaysInZone(tz, today, 3)` is exactly 3 calendar days later
 * in the user's local sense, regardless of DST transitions.
 */
export function addDaysInZone(tz: string, when: Date, days: number): Date {
  const start = startOfDayInZone(tz, when);
  // Add days as ms — DST will be folded back in by wallClockToUtc when we
  // re-anchor through it. To stay strictly correct across spring-forward,
  // re-derive from the resulting calendar date.
  const shifted = new Date(start.getTime() + days * 86400_000);
  return startOfDayInZone(tz, shifted);
}

// F-21 / F-42: canonical user timezone for client-side rendering. The product
// is operated from Malaysia and every user we know about works in MYT, so
// formatting dates and bucketing "today / tomorrow / overdue" against this
// fixed zone gives every view the same answer regardless of the browser's
// reported tz (people travel, devs run the app on EU CI, the dev container
// reports UTC, etc.). Server-side parsing already canonicalises through
// `parseDueDate(input, userTz)` (SL-7); this constant closes the loop on
// the rendering side.
export const APP_DEFAULT_TZ = "Asia/Kuala_Lumpur";

/**
 * Wall-clock midnight (in `tz`) for a given instant, returned as a *naive*
 * Date whose getYear/getMonth/getDate read as the user's local calendar
 * date even if the browser's tz differs. Use this for day-bucket maths
 * (differenceInDays, isToday, eachDayOfInterval) so two views on different
 * machines agree on which calendar day a UTC instant falls in.
 */
export function localDayInZone(when: Date | string, tz: string = APP_DEFAULT_TZ): Date {
  const d = typeof when === "string" ? new Date(when) : when;
  if (isNaN(d.getTime())) return new Date(NaN);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  // en-CA outputs "YYYY-MM-DD". Construct a local Date at that calendar day
  // — date-fns operates on local-tz Dates, so a "naive" Date here makes
  // differenceInDays/eachDayOfInterval behave consistently regardless of
  // browser tz.
  const [y, m, dd] = ymd.split("-").map((s) => parseInt(s, 10));
  return new Date(y, m - 1, dd);
}

/**
 * Format an instant in the canonical user zone using a small format set we
 * actually need on the client. Avoids importing date-fns just to do tz-aware
 * formatting (date-fns format() doesn't take a tz — it always uses browser
 * local). Supported tokens: "MMM d", "MMM d, yyyy", "yyyy-MM-dd", "h:mm a".
 */
export function formatInZone(when: Date | string, fmt: string, tz: string = APP_DEFAULT_TZ): string {
  const d = typeof when === "string" ? new Date(when) : when;
  if (isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { timeZone: tz };
  switch (fmt) {
    case "MMM d":
      opts.month = "short"; opts.day = "numeric"; break;
    case "MMM d, yyyy":
      opts.month = "short"; opts.day = "numeric"; opts.year = "numeric"; break;
    case "yyyy-MM-dd":
      // Use en-CA which renders as ISO date.
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    case "h:mm a":
      opts.hour = "numeric"; opts.minute = "2-digit"; opts.hour12 = true; break;
    default:
      opts.month = "short"; opts.day = "numeric"; break;
  }
  return new Intl.DateTimeFormat("en-US", opts).format(d);
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
