# Audit follow-ups — 2026-05-07

Findings from the three audit docs (backend, frontend, random) that were
**not** addressed in the bulk-fix pass and the specific information needed
to close each one.

The fixes that *were* applied are tagged with `F-XX` comments in the source —
grep `F-` to find them.

---

## Skipped — needs information / repro

### F-05  RSC prefetch returns 503 on many sidebar routes
**Status:** unresolved — code paths look fine, can't pinpoint root cause from reading alone.

**What I need:**
- Server log excerpt covering one repro (timestamp + the 503 response body).
- Browser DevTools → Network tab capture of the moment the 503s appear (HAR or screenshot of all the failing rows + their request/response headers).
- Whether the 503s reproduce on a freshly-restarted container or only after some time has passed (memory/connection leak signal).

The polling backoff in `job-status-badge` and `notification-bell` should reduce
overall background load, which may already mask this in practice.

### F-19  Same 4 tasks in day grid AND "Unscheduled" sidebar simultaneously
### F-20  Schedule page grid empty while Dashboard claims 4 scheduled blocks today
**Status:** both endpoints query the same `timeBlocks` table — disagreement is either a date-window mismatch or seeded mock data.

**What I need:**
- One task / time block where the bug is reproducible. I need:
  - The block's stored `startTime` and `endTime` (UTC) — `docker exec ai-tasks sqlite3 /data/ai-tasks.db "SELECT id, title, startTime, endTime FROM timeBlocks WHERE date(startTime, '+8 hours') = date('now', '+8 hours');"`
  - A screenshot of the Dashboard's "Today's schedule" widget *and* the Schedule day grid taken at the same moment.
- Whether you also want me to remove the seeded "Run ads / Post Content" data from the database, or if those are real entries.

### F-21  "Run ads" shows May 7 in Schedule but May 8 in My Tasks
### F-42  Timeline pip positioned LEFT of Today marker (sister bug)
**Status:** date display uses `format(new Date(dueDate), "MMM d")` consistently across views, so they should agree. Without the actual divergent task I'd be guessing and could regress.

**What I need:**
- The specific task ID. From there I can pull `dueDate` from SQLite and reason precisely.
- Your browser's timezone at the time of the screenshot (e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone` in the console).
- Screenshots of: Schedule, My Tasks list, and the Tasks Timeline view all open to that task.

I suspect the bug is one of: (a) one view treats the date as `dueDate.split('T')[0]` somewhere, (b) one view caches stale data from a prior session, or (c) seed data has a pathological boundary value (16:00 UTC = midnight MYT = "spans two dates" depending on rounding).

---

## Skipped — design decisions / scope calls for you

### F-27  Theme toggle is per-page, not global
The theme provider needs hoisting to the layout root (and persisted via `next-themes` localStorage). Will it conflict with the per-page hardcoded yellow on `/team`? Confirm: should `/team` follow the global theme, or stay yellow as a brand choice?

### F-34  Workload bars unlabelled / static red
Two changes need a call:
1. Threshold colors — green <70%, amber 70–95%, red ≥100%? Or your preferred ramps?
2. Show numeric values inline, in tooltip, or both?

### F-43  All clients bucketed under "Uncategorized"
Drop the group header entirely, or ship the categorisation feature? If shipping, what's the category source — a `clients.category` text column? An enum?

### F-47  My Team is a gamified pixel-art office
Confirm: keep the office-game behind a toggle, or strip it entirely?

### F-50  Currency hardcoded MYR
Per-workspace default currency, or per-client? Where should the user configure it (Settings? Client settings?). Schema change in `clients.currency` (already a column) plus a workspace-level default needed.

### F-53  Completion Trend flat then jumps to 7
Either the data is wrong (seed script artifact) or the chart needs an empty-state. Confirm: real or seed?

### F-58  Decision Journal "Result" column always "—"
Result tracking isn't wired. Should I (a) hide the column until a backfill ships, (b) wire it up (needs a result schema decision)?

### F-76  Meta API status: "Connected as Openclaw" — casing?
Trivial: confirm `Openclaw` vs `OpenClaw` and I'll fix the data.

### F-77  Logs session naming covers all 6 brands but uses one
Confirm: should the sync run be named `sync-cycle-<date>` and the per-brand work be a child? Or keep brand-named runs and add a counter?

---

## Skipped — UI tweaks I didn't get to (low risk, batch later)

These are mostly visual polish I deferred to keep the bulk PR reviewable. Each
should be a single-file change once I'm in front of a browser to verify.

| ID | Where | What |
|----|-------|------|
| F-41 | `app/(app)/tasks/page.tsx` Timeline view | Group tasks by project; render no-due-date items as styled stubs not inline text |
| F-45 | `app/(app)/ai/...` AI conversations | Auto-title from first user message, or allow rename |
| F-55 | `app/(app)/ads/page.tsx` | CPMC label changes to "CPL" when empty — keep label stable, change value only |
| F-56 | `app/(app)/ads/page.tsx` | Ad cards truncate values mid-string — add tooltips or responsive sizing |
| F-57 | wherever date is rendered | Ambiguous `04/07/2026` — use `7 Apr 2026` or label format |
| F-60 | `app/(app)/templates/page.tsx` | Header says 8 but only 6 cards — match count to visible |
| F-62 | `app/(app)/marketing/logs/page.tsx` | Orphan log sessions with 0 entries — either log empty rows differently or hide |
| F-63 | Tiptap editor | `RangeError: Unknown node type: undefined` — sanitize seeded content |
| F-67 | Various truncation sites | Add tooltip on truncation |
| F-69 | Client detail | Stray "Ctrl+V to paste" hint — make conditional on focus |
| F-70 | Client cards | Avatar fallback to initial-on-color placeholder |
| F-73 | New Project form | Dim "Create" button in dark mode |
| F-74 | New Project page heading | Low contrast in dark mode |
| F-75 | Brand cards | Alert pills (Kill/Budget/Duplicate/Spend Cap) need a legend |
| F-78 | CRM filter chips | Add `role="tablist"` |
| F-79 | Schedule page | "Drag-and-drop coming soon" banner — ship or hide |

---

## Tooling/follow-up notes

- **Askpass file** — `C:\Users\tsyeo\AppData\Local\Temp\askpass.cmd` still has the talos password in plaintext. Delete after you rotate.
- **CSP roll-out** — the new CSP is strict (`frame-ancestors 'none'`, scoped `connect-src`). If anything in the dashboard breaks (e.g. a new external API the app suddenly calls), the browser console will report the violation; add the origin to `connect-src` in `next.config.ts`.
- **Workspace auto-pick** — the layout now defaults to a user's first team if they have no personal projects but at least one team membership. This is a one-time decision per request when the cookie is unset; once they pick a workspace via the UI the cookie sticks.
