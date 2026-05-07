# Project rules — read before writing any code in this repo

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

The middleware lives at `src/proxy.ts` (custom name, not the default `middleware.ts`). Folders prefixed with `_` are private/non-routable.
<!-- END:nextjs-agent-rules -->

---

## Security rules (full rationale in `SECURITY-LESSONS.md`)

These were derived from the 2026-05-07 audit (`REVIEW.md`). Do not regress.

### SL-1 Multi-tenancy
- Every DB read/write of user data scopes by `userId`, OR validates ownership of the requested entity ID **before** the operation.
- AI tools that take `taskId` / `projectId` / `brandId` / `clientId` call `checkProjectAccess(userId, ...)` first. No exceptions.
- Public REST endpoints (`/api/v1/*`) derive `accessibleProjectIds` from the authenticated user. Never trust a `project_id` query param.
- Admin endpoints (`/api/admin/*`) gate on an `ADMIN_USER_IDS` env allowlist, never on "user is logged in".
- PATCH/PUT that copy `projectId`/`teamId`/`clientId`/`sectionId` from request body must check the **destination**, not just the source.

### SL-2 Webhooks
- Authenticate cryptographically (provider signature), not by URL secrecy.
- Telegram → verify `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET`.

### SL-3 Filesystem paths
- User-supplied IDs validated against UUID regex before `path.join`.
- Resolve absolute path, assert it stays under `path.resolve(UPLOADS_DIR)` + `path.sep`.
- Use `process.env.UPLOADS_DIR || "/data/uploads"`. **Never** `process.cwd() + "/uploads"` or `src/uploads/` — those vanish on every deploy.
- Sanitize stored filename (`/[\r\n"\\\/]/g → _`) before any `Content-Disposition`.

### SL-4 Uploads
- MIME allowlist (not just file extension).
- 25 MB cap unless explicitly justified in code comment.
- Async file I/O (`fs.promises.readFile`), never `fs.readFileSync` in request paths.

### SL-5 Public endpoints
- Open registration off unless `ENABLE_REGISTRATION=true`.
- Public form submit, registration, password reset → rate-limited by IP, body-size capped, CAPTCHA-or-honeypot.
- Form `isPublic`: opt-in. `isPublic === true`, never `isPublic ?? true`.

### SL-6 Crypto
- Tokens → `crypto.randomBytes(N).toString("base64url")`. Never `Math.random()`.
- Secret comparison → `crypto.timingSafeEqual` after length check. Never plain `===`.
- API keys → per-row salt + HMAC, no global "default-salt" fallback.
- Required env vars (`NEXTAUTH_SECRET`, `API_KEY_SALT`, `TELEGRAM_WEBHOOK_SECRET`, `CRON_SECRET`) → crash on boot if missing, never silent fallback.

### SL-7 Date/time
- All datetime-emitting tools take explicit `userTz` parameter.
- AI inputs → `parseDueDate(input, userTz)`. Strict mode — no `new Date(garbage)` fallback.
- "Today" boundaries → `startOfDayInZone(userTz)` / `endOfDayInZone(userTz)`. Never bare `new Date(y, m, d)`.

### SL-8 Schema
- Every FK column gets a `CREATE INDEX` in the same migration.
- New AI tools live in `getCommandTools(userId, userTz)` factory only — `userId` stays in the closure.

### SL-9 AI rate limiting
- `aiUsageLog` is read to throttle, not just appended.
- Per-user-per-minute and per-user-per-day caps from env (`AI_PER_USER_PER_MIN`, `AI_PER_USER_PER_DAY`).

### SL-10 Healthchecks
- `/api/diag/health` runs `db.run("SELECT 1")` and checks `existsSync(DB_PATH)`. Container `test:` calls this, not `/api/auth/session`.

### SL-11 Diag visibility
- `/api/diag/health` public (boolean only).
- `/api/diag/version` admin-gated (build SHA, node version, env, tz).

### SL-12 XSS / HTML hygiene
- Any AI-output rendered as HTML escapes capture groups before regex transforms.
- Telegram `parse_mode: "HTML"` interpolations → escape with `[<>&]/g → entity` first.

### SL-13 Message splitters
- Use `Intl.Segmenter({ granularity: "grapheme" })`. Never `text.slice(i, i+N)` on UTF-16 code units.
- Whitespace-split before grapheme-split. Don't break URLs.

### SL-14 Race conditions
- Per-link / per-row state mutated by multiple inbound events → wrap in `db.transaction` or use `INSERT … ON CONFLICT … DO NOTHING` + reread.
- Two-step actions (mark approved + execute) → execute first, mark second, both inside the same tx.

### SL-15 Logging
- User-typed content (task titles, message bodies, prompts) only logged behind `DEBUG_*` env gate.
- No PII to default `docker logs`.

### SL-16 Tests
- Auth gates, ownership checks, datetime parsers, message splitter have tests in `src/__tests__/` or co-located `*.test.ts`.
- New security-critical helper without a test → blocks merge.

### SL-17 Single source of truth
- Two transports doing the same thing share a helper (e.g. `buildJarvisRunContext` for web + Telegram).

---

## Anti-pattern grep list (PR self-check before commit)

```
db.query.<table>.findMany({ orderBy })   # SL-1: missing WHERE on user-data table
path.join(process.cwd(), ...)            # SL-3: ephemeral path + traversal
Math.random()                            # SL-6: predictable
=== process.env.SECRET                   # SL-6: timing leak
new Date(<unparsed>)                     # SL-7: silent garbage
process.env.X ?? ""                      # SL-6: silent fallback for secret
parse_mode: "HTML" + ${user}             # SL-12: unescaped
text.slice(i, i + N)                     # SL-13: mid-codepoint cut
console.log("...", userInput)            # SL-15: PII to logs
public route, no rate limit              # SL-5: DoS surface
```

If a PR contains any of the above without a comment explaining why it's safe, it's wrong.

---

## Operational

- Deploy is `git push origin main` → GHCR build → talos pull. Don't use `drizzle-kit push`; migrations run on container start via `scripts/migrate.mjs`.
- Container TZ is baked at `Asia/Kuala_Lumpur` in `Dockerfile` and documented in `docker-compose.yml`. The schema's legacy `America/New_York` default is treated as "unset" in `resolveUserTimezone`.
- Persistent data: `/data` (bind-mounted from `/srv/ai-tasks/data` on talos). Uploads go under `UPLOADS_DIR=/data/uploads`. SQLite at `/data/ai-tasks.db`.
- Diagnostic without SSH: `https://task.edgepoint.work/api/diag/health` for liveness, `/api/diag/version` (admin) for build details.
