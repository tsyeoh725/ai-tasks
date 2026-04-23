# Deploying ai-tasks to Ubuntu

One-command install. Clone the repo on a fresh Ubuntu 22.04 / 24.04 box, run `sudo bash deploy/install.sh`, done. The script is idempotent — the same command upgrades you later.

```
 User ─► Cloudflare (optional) ─► Nginx (TLS) ─► Node (127.0.0.1:3000) ─► SQLite
```

Everything persistent lives inside `/srv/ai-tasks/` — SQLite at `data/ai-tasks.db`, user uploads under `uploads/`.

---

## Prereqs

- An Ubuntu 22.04 / 24.04 VM with a public IP and sudo access.
- A domain with a DNS A/AAAA record pointing at the server's public IP. If you use Cloudflare, keep the proxy cloud **gray (DNS-only)** until the Let's Encrypt cert is issued — then flip it orange.
- Your OpenAI (or Anthropic) API key.

---

## First install

SSH to the box, then:

```bash
git clone https://github.com/you/ai-tasks.git
cd ai-tasks
sudo bash deploy/install.sh
```

The script will:

1. Install Node 20, Nginx, certbot, sqlite3, build tools, and ufw.
2. Create the `aitasks` system user and `/srv/ai-tasks/`.
3. Copy the working tree into `/srv/ai-tasks/`.
4. Prompt for your domain + admin email + OpenAI key.
5. Generate `NEXTAUTH_SECRET`, `API_KEY_SALT`, and a VAPID keypair, and write them to `/srv/ai-tasks/.env.production`.
6. `npm ci` + `npm run build`.
7. Install + start the `ai-tasks` systemd unit.
8. Install the Nginx vhost and issue a Let's Encrypt cert (`certbot --nginx`).
9. Print the final URL.

Non-interactive mode — pass everything via env:

```bash
sudo DOMAIN=tasks.yourdomain.com \
     ADMIN_EMAIL=you@yourdomain.com \
     OPENAI_API_KEY=sk-proj-... \
     bash deploy/install.sh
```

Skip Let's Encrypt (e.g. if you're fronting with Cloudflare Tunnel): `SKIP_TLS=1`.
Skip ufw tweaks: `SKIP_FIREWALL=1`.

---

## First user

The app has no public sign-up. Hit the register API once:

```bash
curl -sS -X POST https://tasks.yourdomain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"You","email":"you@yourdomain.com","password":"a-long-passphrase"}'
```

---

## Updating

SSH in, `git pull` in the repo you cloned, re-run the installer. Same command, in place:

```bash
cd ~/ai-tasks          # or wherever you cloned
git pull
sudo bash deploy/install.sh
```

The script detects the existing `.env.production` and leaves it alone — it only runs `npm ci`, rebuilds, and restarts systemd. Brief downtime (~3–5s).

If you'd rather run updates directly against `/srv/ai-tasks`, that works too:

```bash
cd /srv/ai-tasks
sudo -u aitasks git pull
sudo bash deploy/install.sh
```

---

## Cloudflare in front (optional)

Once the origin serves real HTTPS, in the Cloudflare dashboard:

1. Enable the proxy cloud (orange) on the DNS record.
2. **SSL/TLS → Overview → Full (strict)** — so CF validates your Let's Encrypt cert end-to-end.
3. **SSL/TLS → Edge Certificates → Always Use HTTPS** → On.
4. (Optional) **Rules → Cache Rules**: cache `/_next/static/*` at edge for 1 year.

If you'd rather not expose the origin publicly, use **Cloudflare Tunnel**:

```bash
sudo cloudflared tunnel login
sudo cloudflared tunnel create ai-tasks
sudo cloudflared tunnel route dns ai-tasks tasks.yourdomain.com
# Point the tunnel at http://127.0.0.1:3000 and run install.sh with SKIP_TLS=1.
```

---

## Backups

Nightly SQLite backups under the `aitasks` user's cron:

```bash
sudo -u aitasks crontab -e
# add:
15 3 * * * /usr/bin/bash /srv/ai-tasks/deploy/backup-db.sh >> /srv/ai-tasks/data/backup.log 2>&1
```

Backups go to `/srv/ai-tasks/data/backups/` (gzipped, 14-day retention by default). Snapshot `data/` and `uploads/` off-box periodically (rsync, restic, borg, …).

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `502 Bad Gateway` | `systemctl status ai-tasks` and `journalctl -u ai-tasks -n 200` |
| certbot fails on first install | DNS isn't pointing at the server yet. Fix DNS, then re-run `sudo bash deploy/install.sh`. |
| Push notifications never arrive | VAPID keys mismatch between `.env.production` and the built client. Re-run `install.sh` after any VAPID change. HTTPS required. |
| Uploads 404 | Check `/srv/ai-tasks/uploads/` exists; `install.sh` creates the `src/uploads` → `../uploads` symlink automatically. |
| Login works locally but fails through Cloudflare | Set Cloudflare SSL/TLS to **Full (strict)**. Flexible mode breaks NextAuth because the origin sees `http://` while the browser sent `https://`. |
| `better-sqlite3` native build fails | `install.sh` installs `build-essential` + `python3`. If you skipped it, re-run. |
| WAL file growing forever | `sqlite3 /srv/ai-tasks/data/ai-tasks.db 'PRAGMA wal_checkpoint(TRUNCATE);'` — normally automatic. |

---

## What's in deploy/

```
deploy/
  install.sh              # one-shot installer + updater
  ai-tasks.service        # systemd unit (template)
  nginx.conf              # Nginx vhost (template, tasks.example.com is sed-replaced at install)
  generate-secrets.sh     # rotate NEXTAUTH_SECRET / API_KEY_SALT / VAPID by hand
  backup-db.sh            # SQLite online backup, 14-day retention
```

You shouldn't need to touch anything except `install.sh`. Every other file is a template it copies into place.
