---
reviewed: 2026-05-07
depth: deep
status: issues_found
findings:
  critical: 9
  high: 11
  medium: 9
  low: 5
  total: 34
---

# ai-tasks — Adversarial Code Review

Reviewer's note: this audit only flags problems. Things that look OK are not called out unless explicitly checked-and-clear (see "Risks confirmed absent" at the bottom). Findings ordered by severity, then file.

---

## CRITICAL

### CR-01 — Public REST API ignores ownership entirely (cross-tenant data leak / write)
**File:** `src/app/api/v1/projects/route.ts:12-16`, `src/app/api/v1/tasks/route.ts:8-37`
**What:** `GET /api/v1/projects` returns `db.query.projects.findMany({ orderBy: ... })` — every project of every user. `GET /api/v1/tasks?project_id=…` accepts any `project_id` with zero access check; `POST /api/v1/tasks` writes a task into any `project_id` the caller passes. Any user with one valid API key sees and mutates the entire database.
**Why it matters:** This is the same surface as the AI tools, but the `userId` closure that scopes the AI tools is missing. A single curl with `Authorization: Bearer <any-key>` exfiltrates everyone's projects and tasks.
**Fix sketch:**
```ts
// projects GET
const projectIds = await getAccessibleProjectIds(user.id);
const result = await db.query.projects.findMany({
  where: inArray(projects.id, projectIds),
  orderBy: [desc(projects.updatedAt)],
});
// tasks GET / POST: same canAccessProject(project_id, user.id) gate as the
// session-based /api/tasks/[id] route already uses.
```

### CR-02 — Telegram webhook has no signature verification
**File:** `src/app/api/telegram/callback/route.ts:29-56`, `src/proxy.ts:22-23`
**What:** The webhook is excluded from auth in middleware ("authenticated by Telegram's signed update payload") but the handler never validates a signature. The Telegram Bot API supports `setWebhook(secret_token=…)` which Telegram echoes back in the `X-Telegram-Bot-Api-Secret-Token` header — that check is missing. Anyone who knows the bot's webhook URL (publicly visible at the Cloudflare Tunnel hostname) can POST arbitrary `update.message` payloads.
**Why it matters:** A forged update that contains `from.id`, `chat.id`, and `text` triggers `b.handleUpdate` → grammy dispatches to the `/start <code>`, `/task`, `/digest`, `/reset`, and the catch-all Jarvis handler. With a crafted `chat.id` matching a victim's `telegramChatId`, an attacker bypasses linkage and spends the victim's AI budget, executes Jarvis tools (createTask, deleteTask, pauseAd, approveRecommendation), and reads the victim's data via tool replies — all without ever touching the web app or possessing credentials. Forged `callback_query` directly approves/rejects pending ad recommendations on behalf of the linked user.
**Fix sketch:**
```ts
// in route.ts, before handleUpdate / callback_query handling:
const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!expected) return NextResponse.json({ error: "misconfigured" }, { status: 500 });
const got = req.headers.get("x-telegram-bot-api-secret-token");
if (got !== expected) return NextResponse.json({ error: "forbidden" }, { status: 403 });
// Also: register the webhook with that same secret_token via setWebhook on deploy.
```

### CR-03 — AI tools that take a taskId skip ownership checks → cross-tenant write via prompt injection
**File:** `src/lib/ai-tools.ts:266-301` (getTaskDetails), `:604-640` (blockTimeForTask), `:642-677` (rescheduleTask), `:789-827` (suggestReschedule)
**What:** Each of these tools resolves a `taskId` to a row but never calls `checkProjectAccess(userId, task.project)`. `createTask`, `updateTask`, and `deleteTask` correctly do — these four siblings do not. Combined with `searchUsers` which returns globally and the AI's ability to chain tool calls, a malicious prompt or a compromised conversation can read/mutate other tenants' tasks.
**Why it matters:** Cross-tenant data exposure (getTaskDetails leaks title/description/comments/labels) and corruption (`rescheduleTask` rewrites `dueDate` and **deletes all `timeBlocks` for that taskId+userId scope**, but the access gate is missing — the user is allowed to delete their own blocks for someone else's task).
**Fix sketch:** Wrap each handler with the same `checkProjectAccess(userId, task.project)` gate already used in `updateTask` (line 138). Same applies to `analyzeWorkload` results emitted via `task.title` if access mistakenly leaks task IDs from other tenants — but the WHERE there is correctly userId-scoped, so it's safe.

### CR-04 — `/api/admin/ai-usage` has no admin gate (per-user spend disclosure)
**File:** `src/app/api/admin/ai-usage/route.ts:10-130`
**What:** Returns global aggregates including `byUser` rows of `{userName, userEmail, calls, costUsd}` for the top 20 spenders, and recent error messages (which can contain prompt fragments). The only check is `if (!user) return unauthorized()` — every authenticated user sees everyone's spend, top errors, and admin-only intel.
**Why it matters:** Cost disclosure is mild on its own, but this also exposes attack-surface intelligence (what features are heavily used, where errors are, model mix). Combined with open registration (CR-08) any drive-by signup pulls the full picture.
**Fix sketch:** Gate behind a `users.role === 'admin'` column or env-var allowlist:
```ts
const ADMINS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);
if (!ADMINS.includes(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

### CR-05 — Documents upload enables path traversal and unauthenticated cross-tenant read
**File:** `src/app/api/documents/route.ts:11-86`, `src/app/api/documents/[id]/route.ts:9-49`
**What:** Multiple distinct holes:
1. `GET /api/documents?projectId=…` does **no** access check on `projectId` — anyone logged in lists docs for any project.
2. `POST` interpolates user-supplied `projectId` directly into the filesystem path: `path.join(process.cwd(), "uploads", projectId)`. A `projectId` of `../../../tmp/x` walks the tree and writes attacker-controlled bytes (file-name still uuid'd, but the directory is attacker-chosen).
3. `POST` does no project ownership check before writing.
4. `POST` has no MIME enforcement beyond extension and **no file-size cap** — a 10 GB upload fills `/data` and DoSes the SQLite host.
5. `Content-Disposition: inline; filename="${doc.filename}"` in `[id]/route.ts:46` lets stored CRLF in `filename` perform header injection / response splitting.
6. Files are written to `process.cwd()/uploads/` which is *inside the Next standalone runtime* (an ephemeral container path, not the bind-mounted `/data`). Every container restart loses uploads silently.
**Why it matters:** Anyone who can register can read any uploaded document, write arbitrary bytes to writable container paths, DoS the disk, and inject response headers via stored filename.
**Fix sketch:**
```ts
// GET: gate projectId
if (!(await canAccessProject(projectId, user.id))) return NextResponse.json({error:"Forbidden"},{status:403});
// POST: same gate; sanitize projectId to UUID; cap size; allowlist by mime+ext;
// write under UPLOADS_DIR (default /data/uploads):
if (!/^[a-f0-9-]{36}$/.test(projectId)) return NextResponse.json({error:"bad id"},{status:400});
if (file.size > 25 * 1024 * 1024) return NextResponse.json({error:"too large"},{status:413});
const root = process.env.UPLOADS_DIR || "/data/uploads";
const uploadDir = path.join(root, projectId);
// In [id]/route.ts:
const safe = doc.filename.replace(/[\r\n"]/g, "_");
"Content-Disposition": `attachment; filename="${safe}"`,
```

### CR-06 — Task attachments upload: no project access check, no size cap, ephemeral path, traversal on DELETE
**File:** `src/app/api/tasks/[id]/attachments/route.ts:27-98`
**What:**
- POST never calls `canAccessProject(task.projectId, user.id)` — any logged-in user attaches to any task.
- No MIME or size enforcement at all. `formData.get("file") as File` blindly written.
- `uploadsDir = path.join(process.cwd(), "src", "uploads", "tasks")` — **inside `src/`**, gets nuked on every container deploy because `src/` isn't on the bind mount. All attachments are silently lost on each redeploy.
- DELETE: `path.join(process.cwd(), "src", attachment.filePath)` joins the *DB-stored* `filePath`, which begins with `/uploads/tasks/...`. If a row's `filePath` were ever crafted (or another route inserts attachments), `unlink` could be coerced; even today, an absolute path overrides the join base, allowing a tampered DB row to delete arbitrary files. Defensive coding fail.
**Fix sketch:** Add `canAccessProject` to POST, GET, DELETE. Move uploads root to `process.env.UPLOADS_DIR`. On DELETE, resolve and assert path stays inside the uploads root:
```ts
const root = path.resolve(process.env.UPLOADS_DIR || "/data/uploads");
const target = path.resolve(path.join(root, path.basename(attachment.filePath)));
if (!target.startsWith(root + path.sep)) throw new Error("path escape");
```

### CR-07 — `/api/forms/[id]/submit` is unauthenticated, unrate-limited, no CAPTCHA
**File:** `src/app/api/forms/[id]/submit/route.ts:14-152`, `src/proxy.ts:19-20`
**What:** The proxy explicitly bypasses auth for `/api/forms/*/submit` (and `/api/f/*`). No rate limit, no CAPTCHA, no body-size cap. `createdById: form.createdById` means stamps each spam task as the form owner. Submissions also run `customFieldDefinitions.findFirst` per field, so a 1000-field POST inflates DB load.
**Why it matters:** Trivial to flood any public form with millions of tasks, blowing past SQLite's single-writer ceiling and burying the form owner. No way to dedupe / throttle / disavow.
**Fix sketch:** Wrap with a sliding-window rate limit keyed on `(formId, ip)` (e.g. 10/min/ip, 1000/day/form), enforce body cap (1 MB), ban requests when `data` keys exceed `form.fields.length * 2`. Add an HMAC-signed honeypot or hCaptcha for the public submit endpoint.

### CR-08 — Open public registration (`/api/auth/register`) with no controls
**File:** `src/app/api/auth/register/route.ts:8-42`, `src/proxy.ts:14`
**What:** Anyone can POST `{name,email,password>=6}` and get a fully-privileged account. No email verification, no allowlist, no captcha, no rate limit. Combined with CR-04 they can immediately read global AI spend; combined with CR-01 they get full read of all tasks/projects via the v1 API after creating a key.
**Why it matters:** This was OK while the app was single-tenant. The user has stated the goal of supporting "diverse users" — but right now anybody who guesses the URL (`/register` is linked from `/login`) gets all-access. Cloudflare Tunnel does not change that.
**Fix sketch:** Either disable the route entirely behind `ENABLE_REGISTRATION` env, or require an `INVITE_TOKEN` per signup, or send an email-verification link before activating. At minimum:
```ts
if (process.env.ENABLE_REGISTRATION !== "true") {
  return NextResponse.json({error:"Registration closed"}, {status: 403});
}
const allowed = (process.env.REGISTRATION_DOMAIN_ALLOWLIST || "").split(",");
if (allowed.length && !allowed.some(d => email.endsWith("@" + d))) return NextResponse.json({error:"Domain not allowed"},{status:403});
```

### CR-09 — `sendTelegramNotification` AI tool can spam any user with a linked Telegram
**File:** `src/lib/ai-tools.ts:480-499`
**What:** Tool only checks `recipient` exists; no team-membership / shared-project / consent gate. Combined with `searchUsers` (line 506) which lists ALL users globally, a malicious prompt (or simple curiosity) can use Jarvis to message arbitrary users on the platform.
**Why it matters:** Direct abuse vector for harassment, phishing, and targeted social engineering — Jarvis-authored messages look authoritative because they come from the platform bot. Compounds with CR-02 (forged updates trigger this same tool surface).
**Fix sketch:**
```ts
// before sendTelegramMessage:
const allowed = await db.query.teamMembers.findFirst({
  where: and(
    eq(teamMembers.userId, recipientUserId),
    inArray(teamMembers.teamId, /* teams the caller is in */),
  ),
});
if (!allowed) return { error: "Recipient is not a teammate. Cross-tenant DM is disabled." };
```

---

## HIGH

### HI-01 — `searchUsers` AI tool enumerates all users globally
**File:** `src/lib/ai-tools.ts:501-518`
**What:** `LIKE %query%` on the entire `users` table. Returns id+name+email of up to 10 matches. Any logged-in user (or via CR-02 a forged Telegram chat) can dump the user directory by issuing prompts like "list users matching 'a'", "...'b'", and so on.
**Fix:** Restrict to `teamMembers` joined with the caller's teams. If teamless, return the calling user only.

### HI-02 — `PATCH /api/tasks/[id]` allows moving tasks into projects the user can't access
**File:** `src/app/api/tasks/[id]/route.ts:85`
**What:** `if (updates.projectId !== undefined) updateData.projectId = updates.projectId;` — only the **source** project is checked (line 60), never the destination. Same hole on `clientId` and `sectionId`. A teammate can move tasks into another tenant's project they have no membership in.
**Fix:** When `updates.projectId !== undefined`, run `canAccessProject(updates.projectId, user.id)` before applying.

### HI-03 — API key hashing is fast SHA-256 with weak default salt
**File:** `src/lib/api-auth.ts:7-9`, `src/app/api/keys/route.ts:9-12`
**What:** `createHash("sha256").update(key + salt).digest("hex")` — a fast, unsalted-per-row hash. If `process.env.API_KEY_SALT` is missing, **silent fallback to "default-salt"**. Random keys are 32 bytes which is high-entropy, but a stolen DB still allows offline brute force at GPU speeds, and the global salt means cracking one user cracks all.
**Fix:** Per-key random salt stored alongside hash, or use HMAC-SHA-256 with a server-only secret, or scrypt/argon2 if you can tolerate the latency. Crash-fast on missing salt:
```ts
const salt = process.env.API_KEY_SALT;
if (!salt) throw new Error("API_KEY_SALT must be set");
```

### HI-04 — API keys never expire and are never revocable from UI
**File:** `src/db/schema.ts:332-339`, `src/app/api/keys/route.ts`
**What:** No `expiresAt` column. No DELETE handler in `route.ts` (and even if there is one elsewhere, no rotation policy). `apiKeys.lastUsedAt` is the only tracking column.
**Fix:** Add `expiresAt` (nullable) and `revokedAt` columns; check both in `authenticateApiKey`. Add a DELETE/UI to revoke. Print key only once on creation (already done) — also offer rotation with overlap window.

### HI-05 — CRON_SECRET comparison is timing-unsafe (and accepts empty as legitimate when env is unset)
**File:** `src/app/api/cron/monitor/route.ts:40-45`, `src/app/api/cron/weekly/route.ts:14-19`
**What:** `if (envSecret && cronSecretHeader === envSecret) return cron-trusted`. Plain `===` is timing-leak-prone (low risk on a remote net, but trivial to fix). More importantly the in-process scheduler at `src/lib/marketing/scheduler.ts:87,100` sends `process.env.CRON_SECRET ?? ""` — if the env is unset, the in-process cron POSTs an empty header, which the route's `if (envSecret && …)` rejects, so cron silently fails to bypass auth. The `getSessionUser` fallback then 401s the cron call. **Misconfigured prod silently disables the safety-net cron.**
**Fix:** Use `crypto.timingSafeEqual` and refuse to start the scheduler if `CRON_SECRET` is unset:
```ts
import { timingSafeEqual } from "crypto";
const a = Buffer.from(cronSecretHeader || "");
const b = Buffer.from(envSecret);
if (a.length === b.length && timingSafeEqual(a, b)) return { cron: true, userId: null };
// scheduler.ts boot:
if (!process.env.CRON_SECRET) console.error("[cron] CRON_SECRET not set; safety-net crons will fail auth"); 
```

### HI-06 — `parseDueDate` last-resort `new Date(trimmed)` accepts garbage
**File:** `src/lib/datetime.ts:62-65`
**What:** `const d = new Date(trimmed); return isNaN(d.getTime()) ? null : d;` — but `new Date("2026-99-99")` returns `Invalid Date` so that one's fine, while `new Date("2026")` returns Jan 1 UTC silently, and `new Date("June 7")` returns June 7 of the *current year* in *server tz* (UTC-by-default in Docker if TZ is unset; MYT here). The AI is encouraged to send only ISO; the regex up-front catches well-formed inputs; but the fallback masks model misbehavior — e.g. a future model upgrade that emits `"7 May"` will store **wrong dates without erroring**.
**Fix:** Drop the fallback and return `null` so callers surface a parse error to the model, which already retries:
```ts
return null; // be strict; model gets a clean retry signal
```

### HI-07 — `splitForTelegram` splits mid-codepoint and fails on long no-whitespace strings
**File:** `src/lib/telegram.ts:20-47`
**What:** Hard-slice path uses `piece.slice(i, i + 4000)` which slices on UTF-16 code-unit indices — emoji, CJK supplementary, and combining characters get cut in half, producing invalid surrogate pairs that Telegram either rejects (HTTP 400) or renders as `?`. Worse: if the assistant returns a single 5000-char URL with no `\n`, the splitter hits the hard-slice path and breaks the URL, silently corrupting links to user-facing things like ad approval URLs.
**Fix:** Use `Intl.Segmenter` with `granularity: "grapheme"` to walk graphemes and accumulate up to 4000 *bytes* (not chars; Telegram's limit is characters, but UTF-16 code-unit count is what their API counts). For URL safety, prefer to split at whitespace first:
```ts
function splitForTelegram(text: string) {
  if ([...text].length <= 4000) return [text]; // proper code-point count
  // ...split on whitespace first; only hard-slice when the model emits 4000+ no-whitespace chars
  const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
  // accumulate graphemes
}
```

### HI-08 — Health check passes when DB is broken
**File:** `docker-compose.yml:28`, `src/app/api/auth/session/route.ts` (NextAuth handler)
**What:** Healthcheck calls `/api/auth/session` which returns `{}` for unauthenticated requests **even if SQLite is corrupt** (NextAuth doesn't touch the DB for an empty session). The container reports healthy while every DB write is failing.
**Fix:** Add `/api/diag/health` that does `db.run("SELECT 1")` and `existsSync(DB_PATH)`. Switch compose `test` to it:
```yaml
test: ["CMD","curl","-fsS","http://localhost:3100/api/diag/health"]
```

### HI-09 — Telegram link-code uses `Math.random()` (non-cryptographic)
**File:** `src/lib/telegram.ts:70`
**What:** `Math.random().toString(36).substring(2, 8).toUpperCase()`. ~30 bits of entropy — not catastrophic, but it's `Math.random()` which is V8-predictable from a few outputs. Worst case: an attacker who can generate codes (anyone with an account) plus the `setTimeout`-based `Math.random` predictability paper trail can guess the next code. Combined with no rate limit on `/start <code>` (CR-02 forging path or even the legit Telegram if attacker has their own bot setup) this is brute-forceable in the 10-min TTL window.
**Fix:**
```ts
import { randomBytes } from "crypto";
const code = randomBytes(4).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
```

### HI-10 — Link-code generation has unhandled PK collision and redundant scan
**File:** `src/lib/telegram.ts:64-77`
**What:** `code` is the table primary key. With 36^6 = 2.17B keyspace and a 10-min TTL, collisions are statistically rare for one app, but `db.insert(...)` will throw on collision — the caller (`/api/telegram/link` POST) returns a 500 to the user with no retry. Also `await db.delete(... lt expiresAt < now)` runs on every code generation; cheap, but if you hit a write-spike the `INSERT` after the `DELETE` doesn't run in a transaction → the DELETE wastes a tx.
**Fix:** Wrap in `db.transaction(...)`. On insert error from unique-constraint, regenerate up to 3 times. Switch to `crypto.randomBytes` (HI-09) which makes collisions astronomically rare anyway.

### HI-11 — `markdownToHtml` does no HTML escaping before injecting into editor
**File:** `src/components/rich-text-editor.tsx:17-94, 206-208`
**What:** AI-drafted text from `aiEndpoint` is run through a hand-rolled regex markdown-to-HTML, then `editor.chain().insertContent(html).run()`. The function never HTML-escapes the captured groups — `**<img onerror=alert(1) src=x>**` becomes `<strong><img onerror=alert(1) src=x></strong>`. tiptap's StarterKit will sanitize most output (it parses through ProseMirror's schema), but custom marks or future StarterKit extensions can blow this open. Worse: if the same HTML ever ends up rendered raw outside the editor (e.g. in an email digest, in the API), it's stored XSS.
**Fix:** Escape input before emitting:
```ts
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]!));
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")...
```
Better: use a vetted lib (markdown-it with `html: false`).

---

## MEDIUM

### MD-01 — `/api/diag/version` is public and leaks build/runtime data
**File:** `src/app/api/diag/version/route.ts:22-42`, `src/proxy.ts:24-26`
**What:** Returns `nodeVersion`, `containerTz`, `TZ` env, `NODE_ENV`, build SHA, and full `formatNowInZone` output. Build SHA + node version aid CVE targeting. Container TZ + offset is innocuous on its own.
**Fix:** Either move this behind auth (the comment says "no sensitive data" — node version is sensitive enough), or trim to `{buildSha, nodeEnv}` only.

### MD-02 — JS-Date assumptions break on non-server-tz day boundaries
**File:** `src/lib/jarvis-chat.ts:153-167`, `src/app/api/ai/command/route.ts:89-103`, `src/lib/ai-tools.ts:527-531`, `:679-706`, `:799-805`
**What:** `new Date(today.getFullYear(), today.getMonth(), today.getDate())` uses the **server's** local-tz day boundary, then queries `gte(timeBlocks.startTime, todayStart)` to fetch "today's blocks." For a user in Asia/Kolkata when server is MYT, "today" starts 2.5 h late; for a user in Pacific/Auckland it's 4 h early. Schedule listings will silently include yesterday or omit today depending on the user's timezone.
Same bug in `analyzeWorkload` (`today.setDate(today.getDate() + i)`) and `suggestReschedule` (`d.setDate(d.getDate() + i)` on `new Date()`).
**Fix:** Compute `todayStart` as wall-clock midnight in `userTz`, convert back to UTC. The same `wallClockToUtc` helper in `datetime.ts` already does it; expose `startOfDayInZone(userTz)` and use everywhere.

### MD-03 — System prompt encourages "no markdown" but `formatNowInZone` returns Markdown-unsafe parens, and Telegram parses HTML entities by default off — but flips on if user toggles
**File:** `src/lib/telegram.ts:451`, `src/lib/jarvis-chat.ts:174-177`
**What:** Plain-text Telegram sends are fine, but `sendApprovalPrompt` forces `parse_mode: HTML` and interpolates *user-supplied* `journalEntry.adName`, `brandName`, `reason`, `recommendation`. If any of those contain `<` `>` `&` (e.g. an ad named "X<Y" or a reason copied from Meta with `&amp;`), Telegram returns 400 Bad Request and the approval never goes out — silently. Reason fields from the AI guard are LLM output: easily contains `<` characters.
**Fix:**
```ts
const esc = (s: string) => s.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]!));
const text = `🤖 <b>Approval needed</b>\n\n<b>Action:</b> ${esc(...)}\n...`;
```

### MD-04 — `aiMessages` race: two near-simultaneous Telegram messages create duplicate user turns and break ordering
**File:** `src/lib/jarvis-chat.ts:236-244`, `src/lib/telegram.ts:344-356`
**What:** `getOrCreateJarvisConversation` is called per inbound message. Two messages arriving 100 ms apart on a fresh chat both find `link.activeConversationId === null` (or stale), each inserts a new `aiConversations` row, and each `update telegramLinks set activeConversationId = ...`. The second wins; the first conversation's user turn becomes orphaned. History replay reads only the winning conversation, so the model sees one of the two messages on the *next* turn and is confused about why the user "asked twice".
**Fix:** Serialize per-link with a row-level lock or upsert pattern: on first insert use `INSERT … ON CONFLICT(user_id) DO NOTHING` semantics, then re-read. Or queue messages per `chatId` in memory with a bounded mutex.

### MD-05 — Drizzle migrations lack indexes on hot columns (multi-user perf cliff)
**File:** `drizzle/0000_init.sql` (60+ tables, 0 indexes)
**What:** No index on `tasks.projectId`, `tasks.assigneeId`, `tasks.status`, `tasks.dueDate`, `projects.ownerId`, `projects.teamId`, `teamMembers.userId`, `teamMembers.teamId`, `aiMessages.conversationId`, `taskComments.taskId`, `notifications.userId` — all of which are scanned on every page load and every AI tool call. SQLite handles this fine at 5 users / few k rows. At 50 users / 100 k tasks the `listTasks` tool's `inArray(tasks.projectId, accessibleIds)` becomes a full scan per call; the AI's natural retry behavior amplifies it. This is in-scope per the "future-proofing for diverse users" theme.
**Fix:** Add a migration creating indexes:
```sql
CREATE INDEX tasks_project_idx ON tasks(project_id);
CREATE INDEX tasks_assignee_idx ON tasks(assignee_id);
CREATE INDEX tasks_status_idx ON tasks(status);
CREATE INDEX tasks_due_idx ON tasks(due_date);
CREATE INDEX projects_owner_idx ON projects(owner_id);
CREATE INDEX projects_team_idx ON projects(team_id);
CREATE INDEX team_members_user_idx ON team_members(user_id);
CREATE INDEX team_members_team_idx ON team_members(team_id);
CREATE INDEX ai_messages_conversation_idx ON ai_messages(conversation_id);
CREATE INDEX task_comments_task_idx ON task_comments(task_id);
CREATE INDEX notifications_user_idx ON notifications(user_id);
```

### MD-06 — No app-level AI rate limit; aiUsageLog records but doesn't throttle
**File:** all AI command paths (`src/app/api/ai/command/route.ts`, `src/lib/jarvis-chat.ts`, automation paths)
**What:** `aiUsageLog` faithfully records every call but nothing reads it back to gate. A user (or a forged Telegram update via CR-02) can trigger unbounded `streamText` calls, each fanning out 5 tool steps. With 30 tools and a model that can chain, single sessions can spend tens of dollars in a minute. The "5 step budget" caps tool chains per turn, not turns per second.
**Fix:** Add a per-user-per-minute and per-day cap derived from `aiUsageLog`:
```ts
const lastMin = await db.select({n:count()}).from(aiUsageLog).where(and(eq(userId,user.id), gte(createdAt, new Date(Date.now()-60_000))));
if (lastMin[0].n > 20) throw new Error("Slow down — 20 calls/min cap");
```

### MD-07 — `isPublic` defaults to `true` when creating a form
**File:** `src/app/api/forms/route.ts:76`
**What:** `isPublic: isPublic ?? true,`. Missing `isPublic` in the request body means the form is publicly submittable by default. Combined with CR-07 (no rate limit), every accidentally-shared form is a free spam channel.
**Fix:** `isPublic: isPublic === true,` — opt-in, not opt-out. Document this in the form-creation UI.

### MD-08 — `executeJournalEntry` runs in callback handler with no idempotency guard
**File:** `src/app/api/telegram/callback/route.ts:101-117`
**What:** Telegram's webhook will retry on any non-2xx response and even on connection blips. Approve-flow does:
1. Update `decisionJournal` to "approved"
2. Call `executeJournalEntry(...)`
If step 2 throws, the row stays "approved" but the action wasn't executed. The catch swallows error and just edits the message. On a retried delivery, `entry.guardVerdict !== 'pending'` short-circuits, so the action will never run. Fail-closed for retry → fail-open for the user (they think they approved but no Meta action happened).
**Fix:** Use a transactional pattern: insert an "execution attempt" row, mark journal verdict only after `executeJournalEntry` succeeds. Or wrap in `db.transaction` with rollback on throw.

### MD-09 — `extractText` uses `fs.readFileSync` and synchronous require in async path
**File:** `src/lib/document-parser.ts:1-37`
**What:** `fs.readFileSync(filePath)` blocks the event loop; on a 50 MB PDF (no size cap from CR-05) this stalls every other request. `require("pdf-parse")` likewise sync-loads on first call. Together they're a request-side DoS amplifier.
**Fix:** Use `await fs.promises.readFile`, lazy-import via dynamic `await import("pdf-parse")`, and gate behind the size cap.

---

## LOW

### LO-01 — `LEGACY_SCHEMA_DEFAULT_TZ` constant duplicated in route default
**File:** `src/app/api/preferences/route.ts:13`
**What:** `DEFAULTS.timezone = "America/New_York"` still shipped despite the migration narrative. New users created via the prefs PUT path that omits `timezone` get the legacy default re-stamped, perpetuating the sentinel-handling burden in `resolveUserTimezone`.
**Fix:** Change the default to `null` (and let `resolveUserTimezone` fall through to container tz) or compute from the request's `Accept-Language` / IP. At minimum, sync this constant with `LEGACY_SCHEMA_DEFAULT_TZ` from `datetime.ts`.

### LO-02 — `/reset` keeps old conversations forever (no purge)
**File:** `src/lib/telegram.ts:270-283`
**What:** Sets `activeConversationId = null` but never deletes prior `aiConversations` / `aiMessages`. Acceptable for an audit trail, but for "clear my memory" this is misleading — and a GDPR/Right-to-be-Forgotten request requires real deletion.
**Fix:** Document in `/help` that history persists. Add a `/reset hard` variant that deletes the linked user's conversations and messages.

### LO-03 — `console.log` of user input in AI tools
**File:** `src/lib/ai-tools.ts:73`, `:152`
**What:** `console.log("[ai-tools.createTask] dueDate input:", JSON.stringify(dueDate), "userTz:", userTz, ...)`. dueDate is user-typed text (could include task subjects via prompt injection, etc.). With Docker `json-file` retention of 50 MB, this is fine for now; with PII-conscious deployments it's a problem.
**Fix:** Demote to `process.env.DEBUG_DATETIME` gated, or remove now that the parser is stable.

### LO-04 — Duplication between `/api/ai/command/route.ts` and `lib/jarvis-chat.ts`
**File:** `src/app/api/ai/command/route.ts:67-217` vs `src/lib/jarvis-chat.ts:115-308`
**What:** Both build the same context (`userTeams`, `userProjects`, `prefs`, `todayBlocks`, `userTz`, schedule summary), assemble nearly-identical system prompts (~95% identical), call `streamText` with `getCommandTools(user.id, userTz)`, persist `aiMessages`, and record usage. The web route diverges only in stream-vs-text and the optional teammate-allowlist filter. Diverging context-build code paths will produce subtly different model behavior on web vs Telegram.
**Fix:** Extract a `buildJarvisRunContext({userId, transport, teammate?})` returning `{systemPrompt, tools, modelMessages}` and have both call sites use it. The streaming vs. drained distinction stays at the route boundary.

### LO-05 — Zero test coverage
**File:** none — `find src tests __tests__ -name '*.test.*' -o -name '*.spec.*'` returns nothing
**What:** No vitest/jest config in `package.json`, no test files. For a system this complex (timezone math, AI tool dispatch, payment-adjacent ad operations) this is a significant maintenance debt. The recent timezone refactor is exactly the kind of change that benefits from a test that pins the parser's behavior across 5-6 IANA zones including Nepal, India, Newfoundland.
**Fix:** Add vitest with a starter suite focused on `parseDueDate`, `wallClockToUtc`, `splitForTelegram`, `resolveUserTimezone`, and `checkProjectAccess`. ~50 tests would cover ~80% of the recent risk areas.

---

## Risks confirmed absent (sanity-checked)

- **SSRF in AI tools:** No tool fetches a URL. Meta API helpers use a hardcoded `META_API_BASE`. Document text extraction reads only local files.
- **SQL injection:** Every `sql\`...\`` template (4 sites in admin/ai-usage, 1 in jobs/active, 1 in ai-tools) interpolates only column references, never user input. Drizzle-orm placeholders cover the rest.
- **Secrets in client bundle:** No `NEXT_PUBLIC_*` env contains a secret. `process.env.GOOGLE_CLIENT_SECRET` etc. are only referenced from server routes.
- **`.env.production` checked in:** `.gitignore` excludes `.env.production`, `.env`, `.env.*`. Confirmed clean.
- **Container TZ/zoneinfo:** Dockerfile installs `tzdata`, sets `TZ=Asia/Kuala_Lumpur`, container Node correctly reports MYT. The legacy-default-trumps-container fallback in `resolveUserTimezone` is functioning as documented.
- **GitHub Actions workflow:** Uses `${{ secrets.GITHUB_TOKEN }}` only; image is unsigned (cosign would be a nice-to-have but not in v1 scope) but pulled from a private GHCR via the same token. Self-hosted runner has implicit Docker access — keep it isolated.
- **`x-forwarded-proto` in `secureCookie`:** The pattern is defensive: if `NODE_ENV=production` the secure flag is on regardless of header. The header-based fallback only kicks in for local dev; an attacker spoofing it in prod doesn't loosen anything because `production` already forces secure.
- **DST in MYT:** No DST in Asia/Kuala_Lumpur, so `wallClockToUtc` doesn't have a transition window to mishandle for the bulk of the user base. Algorithm is also correct for DST zones — the offset is computed at the specific instant.

---

_Reviewed: 2026-05-07 by Claude (Opus 4.7), depth=deep_
