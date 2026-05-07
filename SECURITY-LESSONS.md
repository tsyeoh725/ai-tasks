# Security & Reliability Lessons

> Distilled from the 2026-05-07 deep audit (`REVIEW.md`).
> REVIEW.md is the autopsy. **This file is the rulebook.** Every rule maps back to a finding so we don't forget *why* the rule exists.
>
> Read this before adding a new route, a new AI tool, or a new upload surface. Cite rule numbers in PR descriptions when relevant ("complies with SL-3").

---

## SL-1 — Multi-tenancy isolation is the foundation, not a feature

**Rule**: Every DB read or write of user-owned data is scoped by `userId`, OR validates ownership of the requested entity ID **before** the operation.

**Failures it would have prevented**
- CR-01: `/api/v1/projects` and `/api/v1/tasks` returned/wrote across all users.
- CR-03: Four AI tools (`getTaskDetails`, `blockTimeForTask`, `rescheduleTask`, `suggestReschedule`) skipped `checkProjectAccess` while their siblings (`createTask`, `updateTask`, `deleteTask`) did it correctly. Look-alike tools, opposite behavior.
- HI-02: `PATCH /api/tasks/[id]` checked the *source* project but not the *destination* — a logged-in user could move tasks into projects they had no access to.

**Required patterns**

```ts
// Public REST endpoints — derive accessible IDs first, never trust the query param.
const accessible = await getAccessibleProjectIds(user.id);
const rows = await db.query.projects.findMany({
  where: inArray(projects.id, accessible),
});
```

```ts
// AI tools — every tool taking an entity ID guards before the operation.
if (!(await checkProjectAccess(userId, task.projectId))) {
  return { error: "Project not accessible" };
}
```

**Tripwires (anti-patterns to grep for in review)**
- `db.query.<table>.findMany({ orderBy: ... })` with no `where` → almost always wrong on user-data tables.
- AI tool handler that does `db.query.tasks.findFirst({ where: eq(tasks.id, taskId) })` without joining ownership → wrong.
- Any update/insert that copies user-supplied `projectId`/`teamId`/`clientId`/`sectionId` into `updateData` → must gate the destination.

---

## SL-2 — Webhooks authenticate cryptographically, not by URL secrecy

**Rule**: A publicly-reachable webhook URL is **not** authentication. Every webhook verifies a provider-issued signature before dispatch.

**Failures it would have prevented**
- CR-02: Telegram webhook accepted forged `update.message` payloads. URL hostname is visible in DNS / Cloudflare tunnel listing — "obscure URL" is not a security boundary.

**Required pattern**

```ts
// Telegram callback route — first thing in the handler.
const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!expected) return NextResponse.json({ error: "misconfigured" }, { status: 500 });
const got = req.headers.get("x-telegram-bot-api-secret-token");
if (!got || got !== expected) {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
```

The webhook must be **registered with that same secret** via `setWebhook(secret_token: …)`, otherwise Telegram never sends the header.

For future providers: Stripe → `stripe.webhooks.constructEvent(rawBody, sig, secret)`. GitHub → HMAC-SHA-256 of body with shared secret. Meta → `x-hub-signature-256`. Pattern is identical: provider-issued signature in a header, server holds the secret, server verifies.

---

## SL-3 — User input never lands in a filesystem path unsanitized

**Rule**: Every `path.join(...)` whose components include user-supplied data validates each component against an allowlist regex AND asserts the resolved path stays under the upload root.

**Failures it would have prevented**
- CR-05: `path.join(process.cwd(), "uploads", projectId)` — a `projectId` of `../../../tmp/x` walked the tree.
- CR-06: DELETE re-joined a DB-stored `filePath` that started with `/uploads/...`; an absolute path overrides the join base.

**Required pattern**

```ts
// Validate first.
if (!/^[a-f0-9-]{36}$/.test(projectId)) {
  return NextResponse.json({ error: "invalid id" }, { status: 400 });
}

// Resolve and assert containment second.
const root = path.resolve(process.env.UPLOADS_DIR || "/data/uploads");
const target = path.resolve(path.join(root, projectId, safeBasename));
if (!target.startsWith(root + path.sep)) {
  throw new Error("path escape attempted");
}
```

**Persistence rule**: `process.cwd()/uploads/` is the standalone runtime path inside the container. It vanishes on every redeploy. **Always** use `process.env.UPLOADS_DIR || "/data/uploads"`.

---

## SL-4 — Every upload endpoint enforces MIME, size, and rate

**Rule**: Three controls on every `multipart/form-data` write — MIME allowlist (not just extension), absolute size cap, and rate limit. If any of the three is missing, the endpoint is a DoS vector.

**Failures it would have prevented**
- CR-05: 10 GB upload fills `/data` and DoSes SQLite.
- CR-06: No size enforcement at all on task attachments.
- MD-09: Sync `fs.readFileSync` on a 50 MB PDF blocks the event loop.

**Required pattern**

```ts
const MAX = 25 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf","image/png","image/jpeg","image/webp"]);

if (file.size > MAX) return NextResponse.json({ error: "too large" }, { status: 413 });
if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: "type not allowed" }, { status: 415 });

// Then: rate limit by (userId, route) — see SL-6.
```

**Sanitize filename before any header use**:

```ts
const safe = doc.filename.replace(/[\r\n"\\\/]/g, "_");
"Content-Disposition": `attachment; filename="${safe}"`,
```

CRLF in stored filename → response splitting (CR-05.5).

---

## SL-5 — Public endpoints have rate limit, body cap, and CAPTCHA-or-honeypot

**Rule**: Anything reachable without authentication caps body size, throttles by IP, and includes a CAPTCHA or honeypot for forms. Open registration is **off** by default.

**Failures it would have prevented**
- CR-07: Public form submit was a free task-flooding channel for the form owner.
- CR-08: `/api/auth/register` was wide open — anyone with the URL got an account.
- MD-07: Forms defaulted to `isPublic: true` when the field was omitted.

**Required pattern**

```ts
// Registration gate.
if (process.env.ENABLE_REGISTRATION !== "true") {
  return NextResponse.json({ error: "Registration closed" }, { status: 403 });
}

// Domain allowlist (optional).
const allowed = (process.env.REGISTRATION_DOMAIN_ALLOWLIST || "").split(",").filter(Boolean);
if (allowed.length && !allowed.some(d => email.endsWith("@" + d))) {
  return NextResponse.json({ error: "domain not allowed" }, { status: 403 });
}
```

```ts
// Rate limit (sliding window in DB or in-memory bounded LRU).
const recent = await rateLimit({ key: `submit:${formId}:${ip}`, window: 60_000, max: 10 });
if (!recent.allowed) return NextResponse.json({ error: "too many" }, { status: 429 });
```

**Defaults**: opt-in, not opt-out. `isPublic: isPublic === true,` not `isPublic: isPublic ?? true,`.

---

## SL-6 — Crypto primitives: random, comparison, hashing

**Rule**:
- Tokens — `crypto.randomBytes(N).toString("base64url")`. Never `Math.random()`.
- Secret comparison — `crypto.timingSafeEqual` after length check. Never plain `===`.
- Hashing — HMAC-SHA-256 with server-side secret + per-key random salt, OR argon2id. Never plain SHA-256, never global "default-salt".
- Missing secret env → **crash on boot**, never silent fallback.

**Failures it would have prevented**
- HI-03: API keys hashed with fast SHA-256 + literal `"default-salt"` fallback. DB leak → offline GPU brute force.
- HI-05: `CRON_SECRET` compared with `===` (timing leak). Worse: scheduler sent `?? ""` so a missing env caused silent cron failure.
- HI-09: Telegram link codes used `Math.random()`. V8-predictable.
- HI-10: PK collisions on link codes were unhandled (caller saw 500).

**Required patterns**

```ts
// Token generation.
import { randomBytes } from "crypto";
const code = randomBytes(8).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
```

```ts
// Constant-time comparison.
import { timingSafeEqual } from "crypto";
const a = Buffer.from(headerVal || "");
const b = Buffer.from(envSecret);
if (a.length !== b.length || !timingSafeEqual(a, b)) return forbidden();
```

```ts
// API key hashing — per-key salt + HMAC.
const salt = process.env.API_KEY_SALT;
if (!salt) throw new Error("API_KEY_SALT must be set");
import { createHmac } from "crypto";
const hash = createHmac("sha256", salt).update(key + perKeySalt).digest("hex");
```

```ts
// Boot-time guard.
const required = ["NEXTAUTH_SECRET", "API_KEY_SALT", "TELEGRAM_WEBHOOK_SECRET", "CRON_SECRET"];
for (const k of required) {
  if (!process.env[k]) throw new Error(`${k} must be set`);
}
```

---

## SL-7 — Every datetime crosses the user boundary with explicit `userTz`

**Rule**: No code that produces or consumes user-facing datetimes uses the server's local tz. Every parser, every "today" computation, every formatter takes `userTz` as a parameter.

**Failures it would have prevented**
- The original 4pm-as-8am bug. Container TZ + schema NY default + bare `new Date(YYYY-MM-DD)` → 8 hour drift.
- HI-06: `parseDueDate` last-resort `new Date(garbage)` accepted misshaped input silently.
- MD-02: `analyzeWorkload`, `suggestReschedule`, "today's blocks" used server-local midnight — wrong day for users in different zones.

**Required patterns**

```ts
// Parser layer (already done).
import { parseDueDate, resolveUserTimezone, formatNowInZone } from "@/lib/datetime";
const userTz = resolveUserTimezone(prefs?.timezone);
const due = parseDueDate(input, userTz);
if (!due) return { error: "Could not parse date — please use YYYY-MM-DD or ISO 8601" };
```

```ts
// Day-boundary helpers (use these instead of `new Date(y, m, d)`).
const todayStart = startOfDayInZone(userTz);             // wall-clock midnight in userTz → UTC
const todayEnd   = endOfDayInZone(userTz);
```

**Hard rule**: drop the `new Date(trimmed)` fallback in `parseDueDate`. Return `null` so callers (model retries, error toasts) get a clear signal. Silent garbage is worse than failure.

---

## SL-8 — Every FK column gets an index in the same migration

**Rule**: When a migration adds `*_id`, the same migration adds `CREATE INDEX`. When a tool's hot path filters on a column, that column has an index. No exceptions.

**Failures it would have prevented**
- MD-05: `drizzle/0000_init.sql` declares 60+ tables, **0 indexes**. SQLite hides this at 5 users; at 50 users / 100k tasks the AI's repeated `inArray(tasks.projectId, ...)` becomes a full scan per call.

**Required pattern (in every new migration)**:

```sql
ALTER TABLE thing ADD COLUMN owner_id text;
CREATE INDEX thing_owner_idx ON thing(owner_id);
```

Existing tables to backfill in one consolidating migration:
- `tasks(project_id, assignee_id, status, due_date)`
- `projects(owner_id, team_id)`
- `team_members(user_id, team_id)`
- `ai_messages(conversation_id)`
- `task_comments(task_id)`
- `notifications(user_id)`
- `time_blocks(user_id, start_time, task_id)`
- `ai_usage_log(user_id, created_at)` — for SL-9.

---

## SL-9 — AI usage gates spend, not just records it

**Rule**: `aiUsageLog` is read back to throttle, not just appended to.

**Failures it would have prevented**
- MD-06: A forged Telegram update (CR-02) or a runaway prompt could spend tens of dollars in a minute. The "5 step budget" caps tool chains per turn, not turns per second.

**Required pattern**:

```ts
// Before streamText:
const inLastMin = await db
  .select({ n: count() })
  .from(aiUsageLog)
  .where(and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, new Date(Date.now() - 60_000))));
if (inLastMin[0].n > Number(process.env.AI_PER_USER_PER_MIN ?? 20)) {
  throw new Error("Slow down — too many AI calls in the last minute.");
}
```

Also implement a daily cap per user. Surface to UI as "remaining budget" so users see the ceiling.

---

## SL-10 — Health checks exercise the actual critical path

**Rule**: Container healthchecks execute a DB query and a filesystem check, not just an HTTP route handler.

**Failures it would have prevented**
- HI-08: `/api/auth/session` returns `{}` for unauthenticated requests **even when SQLite is corrupt**. Container reports healthy while every write fails.

**Required pattern**:

```ts
// /api/diag/health
export async function GET() {
  try {
    db.run("SELECT 1");
    if (!existsSync(process.env.DB_PATH || "/data/ai-tasks.db")) throw new Error("db file missing");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
```

```yaml
# docker-compose.yml
test: ["CMD","curl","-fsS","http://localhost:3100/api/diag/health"]
```

---

## SL-11 — Diag endpoints don't leak version intel to anonymous callers

**Rule**: Public diag endpoints return only what's strictly necessary for ops verification. Build SHA, node version, env are admin-gated.

**Failures it would have prevented**
- MD-01: `/api/diag/version` returned `nodeVersion`, `containerTz`, `TZ`, `NODE_ENV`, build SHA. Build SHA + node version aid CVE targeting.

**Required split**:
- `/api/diag/health` — public, returns `{ ok: true }` (boolean only).
- `/api/diag/version` — admin-gated, returns full build/runtime info.

---

## SL-12 — XSS hygiene on all rendered AI output

**Rule**: Any AI-generated text rendered as HTML escapes input before regex transforms. Telegram HTML mode escapes user-supplied interpolations.

**Failures it would have prevented**
- HI-11: `markdownToHtml` injected unescaped capture groups; future StarterKit changes can blow this open.
- MD-03: `sendApprovalPrompt` used `parse_mode: HTML` and interpolated AI-emitted reason text directly. An ad named `"X<Y"` silently 400s the approval.

**Required pattern**:

```ts
const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]!));
const text = `🤖 <b>Approval needed</b>\n\n<b>Action:</b> ${esc(action)}\n<b>Reason:</b> ${esc(reason)}`;
```

Better: use a vetted markdown renderer (`markdown-it` with `html: false`) instead of hand-rolled regex.

---

## SL-13 — Telegram (and any chunked-message transport) splits on graphemes, not code units

**Rule**: Message splitters use `Intl.Segmenter` for `granularity: "grapheme"`. Hard-slicing UTF-16 indices breaks emoji, CJK supplementary, and combining characters. URLs are kept whole.

**Failures it would have prevented**
- HI-07: `splitForTelegram` slices mid-codepoint and fails on a single 5000-char URL with no whitespace.

**Required pattern**:

```ts
const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
const graphemes = [...seg.segment(text)].map(s => s.segment);
// accumulate up to 4000 graphemes; whitespace-prefer; URL-aware
```

---

## SL-14 — Race conditions on per-link state need transactions or upserts

**Rule**: When state lives in a row that multiple inbound events can mutate (Telegram link's `activeConversationId`, etc.), use `INSERT … ON CONFLICT … DO NOTHING` + reread, or wrap in `db.transaction`.

**Failures it would have prevented**
- MD-04: Two near-simultaneous Telegram messages each created a fresh conversation; the second won, the first's user turn was orphaned.
- HI-10: PK collisions on link codes were unhandled.
- MD-08: Telegram approval flow updated `decisionJournal` to "approved" before `executeJournalEntry` succeeded; on error the row stayed approved but the action never ran.

**Required pattern**:

```ts
await db.transaction(async (tx) => {
  await tx.update(decisionJournal).set({ status: "executing" }).where(...);
  await executeJournalEntry(...);  // throws → rollback
  await tx.update(decisionJournal).set({ status: "approved", executedAt: new Date() }).where(...);
});
```

---

## SL-15 — Logging discipline: user content is opt-in via `DEBUG_*`

**Rule**: User-typed content (task titles, message bodies, prompts) does not appear in default container logs. Debug logging is gated behind a per-area env var.

**Failures it would have prevented**
- LO-03: `console.log("[ai-tools.createTask] dueDate input:", JSON.stringify(dueDate), ...)` left raw user input in `docker logs`.

**Required pattern**:

```ts
const debugDt = process.env.DEBUG_DATETIME === "true";
if (debugDt) console.log("[parseDueDate]", input, "→", parsedDue?.toISOString());
```

---

## SL-16 — Tests pin the security-critical paths

**Rule**: Auth gates, ownership checks, and parsers (datetime, message splitter) have tests in `src/__tests__/` or co-located `*.test.ts`. The recent timezone refactor would have caught the container-TZ fallback in CI.

**Failures it would have prevented**
- LO-05: Zero tests in repo. Every change is "deploy-and-pray".

**Minimum starting suite** (~50 tests):
- `parseDueDate` × 8 zones × 6 input shapes
- `wallClockToUtc` across DST transitions (America/New_York, Australia/Lord_Howe)
- `splitForTelegram` edge cases (emoji, CJK, single-long-URL)
- `checkProjectAccess` for owner / member / non-member / cross-team
- Webhook signature verification rejects unsigned + wrong-signed + accepts correct

---

## SL-17 — Single source of truth for shared logic

**Rule**: Two transports doing "the same thing" extract to a helper. Web `/api/ai/command` and Telegram `lib/jarvis-chat` already share `getCommandTools`; they should also share context assembly.

**Failures it would have prevented**
- LO-04: 95%-identical context-build code in two places will eventually drift, producing subtly different model behavior on web vs Telegram.

**Required pattern**:

```ts
// src/lib/jarvis-context.ts
export async function buildJarvisRunContext({
  userId, transport, teammateAllowlist,
}: ...): Promise<{ systemPrompt: string; tools: ReturnType<typeof getCommandTools>; modelMessages: ModelMessage[] }>;
```

Both routes call this; route boundary handles streaming vs drained.

---

## Anti-pattern grep list (for PR self-review)

| Pattern | Why it's wrong | See rule |
|---|---|---|
| `db.query.<table>.findMany({ orderBy })` no WHERE | leaks across users | SL-1 |
| `path.join(process.cwd(), ...)` for uploads | non-persistent + traversal | SL-3 |
| `Math.random()` outside UI animation | predictable | SL-6 |
| `if (a === b) return ok` for secret | timing leak | SL-6 |
| `new Date(unparsedString)` outside parser | silent garbage | SL-7 |
| `process.env.X ?? ""` for a secret | silent fail | SL-6 |
| AI tool taking `taskId` without `checkProjectAccess` | cross-tenant | SL-1 |
| New `*_id` column with no `CREATE INDEX` in same migration | perf cliff | SL-8 |
| `parse_mode: "HTML"` with `${userInput}` no escape | breaks Telegram or XSS | SL-12 |
| `text.slice(i, i + N)` for chunking | mid-codepoint cut | SL-13 |
| `console.log("...", userInput)` in prod path | PII in logs | SL-15 |
| Public form / endpoint with no rate limit | DoS surface | SL-5 |
| Healthcheck route that doesn't query DB | green when broken | SL-10 |

---

_Authored 2026-05-07. Maintain this file as new failure modes surface. New rule = new SL-N entry with the failure that motivated it._
