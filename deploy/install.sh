#!/usr/bin/env bash
# ai-tasks — one-shot installer / updater.
#
# Run as root on Ubuntu 22.04 / 24.04:
#   sudo bash deploy/install.sh
#
# First run:
#   - installs system deps (Node 20, Nginx, certbot, sqlite3, ufw, build tools)
#   - creates the `aitasks` system user + /srv/ai-tasks
#   - copies your working tree to /srv/ai-tasks (if you ran it from elsewhere)
#   - prompts for DOMAIN / ADMIN_EMAIL / OPENAI_API_KEY (unless passed via env)
#   - generates NEXTAUTH_SECRET / API_KEY_SALT / VAPID keypair
#   - builds the app, installs the systemd unit + Nginx vhost
#   - issues a Let's Encrypt cert (skip with SKIP_TLS=1)
#
# Re-run (updates):
#   - detects existing .env.production → keeps it untouched
#   - git pull (if cwd is a git repo)
#   - npm ci + drizzle-kit migrate + build + systemctl restart ai-tasks
#
# Env overrides (all optional):
#   DOMAIN=tasks.yourdomain.com
#   ADMIN_EMAIL=you@yourdomain.com       # for Let's Encrypt + VAPID subject
#   OPENAI_API_KEY=sk-proj-...           # skipped if already in .env.production
#   AI_MODEL=gpt-4o-mini
#   PORT=3000                            # upstream port the Node app binds to
#   SKIP_TLS=1                           # don't run certbot; write a plain :80 vhost
#                                        # (use with Cloudflare Tunnel or another TLS edge)
#   SKIP_FIREWALL=1                      # don't touch ufw
#   SKIP_PULL=1                          # don't run git pull on re-run
#   APP_DIR=/srv/ai-tasks                # override install path
#   APP_USER=aitasks                     # override service user
#   NODE_MAJOR=20                        # override Node major version (skipped if compatible node already present)
#   TELEGRAM_BOT_TOKEN=...               # optional, only if you use the Telegram integration
#
# Safe to re-run — every step is idempotent.

set -euo pipefail

APP_USER="${APP_USER:-aitasks}"
APP_DIR="${APP_DIR:-/srv/ai-tasks}"
NODE_MAJOR="${NODE_MAJOR:-20}"
PORT="${PORT:-3000}"
SKIP_TLS="${SKIP_TLS:-0}"
SKIP_FIREWALL="${SKIP_FIREWALL:-0}"
SKIP_PULL="${SKIP_PULL:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_DIR}/.env.production"

bold()  { printf "\n\033[1m==> %s\033[0m\n" "$*"; }
info()  { printf "    %s\n" "$*"; }
warn()  { printf "\033[33m[warn]\033[0m %s\n" "$*"; }
die()   { printf "\033[31m[error]\033[0m %s\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- root

if [[ $EUID -ne 0 ]]; then
    info "Re-executing with sudo..."
    exec sudo -E bash "$0" "$@"
fi

# Preserve the invoking user's env overrides when dropping to aitasks later.
export APP_USER APP_DIR NODE_MAJOR

# ---------------------------------------------------------------- detect state

FIRST_RUN=0
if [[ ! -f "$ENV_FILE" ]]; then
    FIRST_RUN=1
fi

if (( FIRST_RUN )); then
    bold "First-run install into ${APP_DIR}"
else
    bold "Updating ${APP_DIR}"
fi

# ---------------------------------------------------------------- system deps

bold "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq --no-install-recommends \
    ca-certificates curl gnupg build-essential python3 \
    git rsync sqlite3 nginx certbot python3-certbot-nginx ufw

# If node is already installed and at >= NODE_MAJOR, keep it — don't downgrade
# a shared box. Only install fresh if missing or older than required.
current_node_major=0
if command -v node >/dev/null; then
    current_node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)"
fi
if (( current_node_major < NODE_MAJOR )); then
    bold "Installing Node.js ${NODE_MAJOR}.x (currently: ${current_node_major:-none})"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y -qq nodejs
fi
info "node $(node -v) / npm $(npm -v)"

# ---------------------------------------------------------------- service user

if ! id "$APP_USER" >/dev/null 2>&1; then
    bold "Creating service user: ${APP_USER}"
    useradd --system --create-home --home-dir "/home/${APP_USER}" --shell /bin/bash "$APP_USER"
fi

# ---------------------------------------------------------------- app dir + code

mkdir -p "$APP_DIR" "${APP_DIR}/data" "${APP_DIR}/uploads" "${APP_DIR}/uploads/tasks"

# If install.sh was launched from a different directory than APP_DIR,
# mirror that working tree into APP_DIR (excluding heavy build artifacts).
if [[ "$SRC_DIR" != "$APP_DIR" ]]; then
    bold "Syncing source from ${SRC_DIR} -> ${APP_DIR}"
    rsync -a --delete \
        --exclude='.next/' \
        --exclude='node_modules/' \
        --exclude='data/' \
        --exclude='uploads/' \
        --exclude='.env' \
        --exclude='.env.local' \
        --exclude='.env.production' \
        "${SRC_DIR}/" "${APP_DIR}/"
fi

chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

# Quirk: /api/tasks/[id]/attachments writes to src/uploads/tasks/; /api/documents
# writes to uploads/<projectId>/. Nginx serves /uploads/ from ${APP_DIR}/uploads/,
# so symlink src/uploads -> ../uploads to unify both destinations.
if [[ -d "${APP_DIR}/src" ]]; then
    if [[ -e "${APP_DIR}/src/uploads" && ! -L "${APP_DIR}/src/uploads" ]]; then
        warn "${APP_DIR}/src/uploads is a real dir — migrating contents to ${APP_DIR}/uploads"
        rsync -a "${APP_DIR}/src/uploads/" "${APP_DIR}/uploads/" || true
        rm -rf "${APP_DIR}/src/uploads"
    fi
    sudo -u "$APP_USER" ln -sfn "../uploads" "${APP_DIR}/src/uploads"
fi

# ---------------------------------------------------------------- git pull (re-runs only)

if (( ! FIRST_RUN )) && (( ! SKIP_PULL )) && [[ -d "${APP_DIR}/.git" ]]; then
    bold "git pull --ff-only"
    sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only || warn "git pull failed — continuing with current tree"
fi

# ---------------------------------------------------------------- .env.production

if (( FIRST_RUN )); then
    bold "Collecting configuration"

    if [[ -z "${DOMAIN:-}" ]]; then
        read -rp "    Public domain (e.g. tasks.yourdomain.com): " DOMAIN
    fi
    [[ -n "$DOMAIN" ]] || die "DOMAIN is required"

    if [[ -z "${ADMIN_EMAIL:-}" ]]; then
        read -rp "    Admin email (Let's Encrypt + VAPID contact): " ADMIN_EMAIL
    fi
    [[ -n "$ADMIN_EMAIL" ]] || die "ADMIN_EMAIL is required"

    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
        read -rp "    OpenAI API key (leave blank to fill in later): " OPENAI_API_KEY || true
    fi

    AI_MODEL="${AI_MODEL:-gpt-4o-mini}"

    bold "Generating secrets"
    NEXTAUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
    API_KEY_SALT="$(openssl rand -hex 32)"

    # We need web-push to generate VAPID keys — easiest path is to install
    # deps first so npx has it cached, but `npx --yes web-push` works standalone.
    info "Generating VAPID keypair (npx web-push)..."
    VAPID_ERR="$(mktemp)"
    VAPID_JSON="$(sudo -u "$APP_USER" -H bash -lc 'cd "$HOME" && npx --yes --prefer-online web-push generate-vapid-keys --json' 2>"$VAPID_ERR" || true)"
    if [[ -z "$VAPID_JSON" || "$VAPID_JSON" != *publicKey* ]]; then
        warn "VAPID stderr was:"
        sed 's/^/      /' "$VAPID_ERR" >&2
        rm -f "$VAPID_ERR"
        die "Failed to generate VAPID keys. Check npm registry reachability as the ${APP_USER} user."
    fi
    rm -f "$VAPID_ERR"
    VAPID_PUBLIC="$(printf '%s' "$VAPID_JSON" | grep -o '"publicKey":"[^"]*"' | cut -d'"' -f4)"
    VAPID_PRIVATE="$(printf '%s' "$VAPID_JSON" | grep -o '"privateKey":"[^"]*"' | cut -d'"' -f4)"
    [[ -n "$VAPID_PUBLIC" && -n "$VAPID_PRIVATE" ]] || die "Could not parse VAPID keys from npx output"

    bold "Writing ${ENV_FILE}"
    umask 077
    cat > "$ENV_FILE" <<EOF
# Generated by deploy/install.sh on $(date -Is)
# Safe to edit by hand; \`systemctl restart ai-tasks\` to apply.

NEXTAUTH_URL=https://${DOMAIN}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
# Trust X-Forwarded-Host from Nginx/Cloudflare in front of the app.
# Without this, NextAuth v5 rejects requests with UntrustedHost.
AUTH_TRUST_HOST=true
API_KEY_SALT=${API_KEY_SALT}
PORT=${PORT}
NODE_ENV=production

OPENAI_API_KEY=${OPENAI_API_KEY}
AI_MODEL=${AI_MODEL}

TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${VAPID_PUBLIC}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE}
VAPID_SUBJECT=mailto:${ADMIN_EMAIL}
EOF
    chown "${APP_USER}:${APP_USER}" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    umask 022
else
    # Re-run: .env.production exists. Pull DOMAIN out of it for Nginx.
    DOMAIN="${DOMAIN:-$(awk -F'=' '/^NEXTAUTH_URL=/{ gsub(/https?:\/\//,"",$2); print $2; exit }' "$ENV_FILE")}"
    ADMIN_EMAIL="${ADMIN_EMAIL:-$(awk -F'mailto:' '/^VAPID_SUBJECT=/{ print $2; exit }' "$ENV_FILE")}"
    [[ -n "$DOMAIN" ]] || die "Could not determine DOMAIN from ${ENV_FILE}. Set DOMAIN=... and re-run."
fi

info "Domain: ${DOMAIN}"

# ---------------------------------------------------------------- build app

bold "Installing npm deps (npm ci)"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm ci"

bold "Applying DB migrations (drizzle-kit migrate)"
# Idempotent: drizzle-kit tracks which migrations have run. Safe to call every deploy.
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npx --yes drizzle-kit migrate"

bold "Building Next.js"
sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && NODE_ENV=production npm run build"

# ---------------------------------------------------------------- systemd unit

bold "Installing systemd unit"
install -m 0644 "${APP_DIR}/deploy/ai-tasks.service" /etc/systemd/system/ai-tasks.service
systemctl daemon-reload

# ---------------------------------------------------------------- firewall

if (( ! SKIP_FIREWALL )); then
    bold "Firewall (ufw): allow SSH + HTTP + HTTPS"
    ufw allow OpenSSH       >/dev/null 2>&1 || true
    ufw allow 'Nginx Full'  >/dev/null 2>&1 || true
    ufw --force enable      >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------- nginx vhost

bold "Installing Nginx vhost for ${DOMAIN} (upstream 127.0.0.1:${PORT})"
VHOST=/etc/nginx/sites-available/ai-tasks

if (( SKIP_TLS )); then
    # Minimal HTTP-only vhost — TLS terminated upstream (Cloudflare Tunnel etc.)
    cat > "$VHOST" <<EOF
# /etc/nginx/sites-available/ai-tasks
# HTTP-only vhost. TLS is handled upstream (Cloudflare Tunnel / proxy).
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 50m;

    location = /sw.js {
        proxy_pass http://127.0.0.1:${PORT};
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        expires off;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias ${APP_DIR}/uploads/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        try_files \$uri =404;
    }

    location /_next/static/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_cache_valid 200 1y;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    add_header X-Frame-Options        "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff"    always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;
}
EOF
    chmod 0644 "$VHOST"
else
    install -m 0644 "${APP_DIR}/deploy/nginx.conf" "$VHOST"
    sed -i "s/tasks\.example\.com/${DOMAIN}/g" "$VHOST"
    # Swap upstream port if user overrode PORT.
    if [[ "$PORT" != "3000" ]]; then
        sed -i "s|127\.0\.0\.1:3000|127.0.0.1:${PORT}|g" "$VHOST"
    fi
    # Swap /srv/ai-tasks/uploads alias if APP_DIR overridden.
    if [[ "$APP_DIR" != "/srv/ai-tasks" ]]; then
        sed -i "s|/srv/ai-tasks/uploads/|${APP_DIR}/uploads/|g" "$VHOST"
    fi
    # If no cert yet, comment out ssl_certificate so nginx -t passes first time.
    if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
        sed -i "s|^\(\s*ssl_certificate.*\)|#\1|" "$VHOST"
    fi
fi

ln -sfn "$VHOST" /etc/nginx/sites-enabled/ai-tasks

mkdir -p /var/www/certbot
chown -R www-data:www-data /var/www/certbot

if ! nginx -t; then
    die "nginx -t failed — inspect ${VHOST}"
fi
systemctl reload nginx

# ---------------------------------------------------------------- TLS

if (( ! SKIP_TLS )); then
    if [[ ! -d "/etc/letsencrypt/live/${DOMAIN}" ]]; then
        bold "Issuing Let's Encrypt cert for ${DOMAIN}"
        if ! certbot --nginx -d "$DOMAIN" --redirect --agree-tos \
                     -m "$ADMIN_EMAIL" -n; then
            warn "certbot failed. Re-run after DNS points at this host, or set SKIP_TLS=1."
        fi
    else
        info "TLS cert already present for ${DOMAIN} — skipping certbot"
    fi
else
    warn "SKIP_TLS=1 — not issuing a Let's Encrypt cert. Make sure you front this with Cloudflare Tunnel or similar."
fi

# ---------------------------------------------------------------- start service

bold "Enabling + (re)starting ai-tasks"
systemctl enable ai-tasks >/dev/null 2>&1 || true
systemctl restart ai-tasks
sleep 2
if ! systemctl is-active --quiet ai-tasks; then
    warn "ai-tasks failed to start — showing recent logs:"
    journalctl -u ai-tasks -n 50 --no-pager || true
    die "Service not running."
fi

# ---------------------------------------------------------------- done

cat <<EOF

$(printf '\033[32m%s\033[0m' "==> ai-tasks is live")

    URL:           https://${DOMAIN}
    App dir:       ${APP_DIR}
    Service:       systemctl status ai-tasks
    Logs:          journalctl -u ai-tasks -f
    Env file:      ${ENV_FILE}

EOF

if (( FIRST_RUN )); then
    cat <<EOF
Next steps:

  1. Point DNS at this server (A/AAAA record) if you haven't. If you're using
     Cloudflare, keep the proxy cloud gray until you've confirmed the site
     loads over HTTPS, then flip to orange and set SSL/TLS = Full (strict).

  2. Create your first user (the app has no public sign-up):
       curl -sS -X POST https://${DOMAIN}/api/auth/register \\
         -H "Content-Type: application/json" \\
         -d '{"name":"You","email":"${ADMIN_EMAIL}","password":"a-long-passphrase"}'

  3. Nightly SQLite backup (optional):
       sudo -u ${APP_USER} crontab -e
       # add:
       15 3 * * * /usr/bin/bash ${APP_DIR}/deploy/backup-db.sh >> ${APP_DIR}/data/backup.log 2>&1

  4. Allow the service user to restart itself on future deploys (optional):
       echo '${APP_USER} ALL=(root) NOPASSWD: /bin/systemctl restart ai-tasks' \\
         | sudo tee /etc/sudoers.d/ai-tasks
       sudo chmod 440 /etc/sudoers.d/ai-tasks

To deploy an update later:
    cd ${APP_DIR} && sudo bash deploy/install.sh
EOF
fi
