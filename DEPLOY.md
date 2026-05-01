# Deploying ai-tasks

Self-hosted via Docker. **`git push origin main` is the entire deploy.**

```
 You ──git push──▶ GitHub
                     │
                     ▼
              GitHub Actions
              ├── builds Docker image
              ├── publishes to ghcr.io/tsyeoh725/ai-tasks:latest
              └── ssh's into the server
                       │
                       ▼
                 Server (192.168.100.200)
                 docker compose pull && up -d   ← ~3s downtime
                       │
                       ▼
                 Cloudflare Tunnel
                       │
                       ▼
                 task.edgepoint.work
```

Persistent state lives in `/srv/ai-tasks/data/` on the server (SQLite DB + uploads). Image swaps don't touch it.

---

## Day-to-day workflow

```bash
# Make changes locally
cd ~/Desktop/AI-Task\ new/Archive\ 2
# ...edit files...
git add .
git commit -m "describe the change"
git push origin main          # ← that's it. ~3 min later it's live.
```

Watch the deploy:

```bash
gh run watch                  # streams the running workflow
# or open https://github.com/tsyeoh725/ai-tasks/actions
```

---

## What lives where

| | Path |
|---|---|
| Local source | `~/Desktop/AI-Task new/Archive 2/` (git remote: `tsyeoh725/ai-tasks`) |
| Server image | `ghcr.io/tsyeoh725/ai-tasks:latest` (and `:sha-<short>` per build) |
| Server compose dir | `/srv/ai-tasks/` (compose file, env, data dir) |
| Server data | `/srv/ai-tasks/data/` — `ai-tasks.db` + `uploads/` (bind-mounted into container) |
| Server env | `/srv/ai-tasks/.env.production` (loaded by docker-compose) |
| Cloudflare tunnel | `task.edgepoint.work` → `http://localhost:3100` |

---

## Manual operations on the server

SSH in: `ssh talos@192.168.100.200`

```bash
cd /srv/ai-tasks

docker compose ps                  # status
docker compose logs -f --tail=200  # live logs
docker compose pull && \
  docker compose up -d              # manual pull/restart (CI usually does this)
docker compose restart              # restart without pulling
docker compose down                 # stop everything (data dir untouched)

# Rollback to a specific build
docker pull ghcr.io/tsyeoh725/ai-tasks:sha-abc1234
# edit docker-compose.yml: image: ghcr.io/tsyeoh725/ai-tasks:sha-abc1234
docker compose up -d
```

DB shell:

```bash
sqlite3 /srv/ai-tasks/data/ai-tasks.db
```

Backup the DB before something risky:

```bash
sqlite3 /srv/ai-tasks/data/ai-tasks.db ".backup '/srv/ai-tasks/data/ai-tasks.$(date +%F).db'"
```

---

## Local development

You don't need Docker locally — just run Next directly:

```bash
npm install
npm run dev          # http://localhost:3000, hot reload, uses ./data/ai-tasks.db
```

`.env.local` provides dev secrets (already set up). The local SQLite DB at `./data/` is independent from production.

To smoke-test the production image locally before pushing:

```bash
docker build -t ai-tasks:local .
docker run --rm -p 3100:3100 \
  --env-file .env.production \
  -v $(pwd)/data:/data \
  ai-tasks:local
```

---

## Updating dependencies / Node version

- **npm packages**: edit `package.json`, `npm install`, commit `package.json` + `package-lock.json`, push.
- **Node version**: edit `Dockerfile`'s `NODE_VERSION` build arg, push.

---

## CI secrets (GitHub Actions)

Set under [repo settings → Secrets and variables → Actions](https://github.com/tsyeoh725/ai-tasks/settings/secrets/actions):

| Secret | Value |
|---|---|
| `SSH_HOST` | `192.168.100.200` |
| `SSH_USER` | `talos` |
| `SSH_PORT` | `22` |
| `SSH_PRIVATE_KEY` | private key whose public key is in `~talos/.ssh/authorized_keys` on the server |

GHCR publishing uses the auto-generated `GITHUB_TOKEN` — no extra setup.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Push didn't trigger a deploy | https://github.com/tsyeoh725/ai-tasks/actions — workflow file is `.github/workflows/deploy.yml` |
| Deploy ran but site is still old | `docker compose ps` on server — image SHA should match the latest commit. Force-pull with `docker compose pull && up -d`. |
| `502 Bad Gateway` from Cloudflare | Container isn't healthy. `docker compose logs --tail=200`. Check the cloudflared config still points to `http://localhost:3100`. |
| Migrations failed on container start | `docker compose logs ai-tasks` — Drizzle runs `node scripts/migrate.mjs` before Next starts. |
| Login works locally, fails through Cloudflare | `NEXTAUTH_URL` in `.env.production` must match the public URL (`https://task.edgepoint.work`), and `AUTH_TRUST_HOST=true`. |
| Image is huge | The Dockerfile uses Next standalone output + multi-stage, target is ~150 MB. If it bloats, check `.dockerignore`. |
| Native better-sqlite3 build fails in CI | The `deps` stage installs `python3 make g++ libsqlite3-dev`. If you bump Node major, native rebuild may need an `npm rebuild better-sqlite3`. |
