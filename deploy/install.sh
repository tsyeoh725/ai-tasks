#!/usr/bin/env bash
# deploy/install.sh — idempotent bootstrap for ai-tasks.
#
# Run on Ubuntu 22.04+ as root:
#   sudo bash deploy/install.sh
#
# What this does (idempotent — safe to re-run):
#   1. Installs system deps (Node, Nginx, sqlite3)
#   2. Creates `aitasks` user + /srv/ai-tasks-data/{db,uploads,backups}
#   3. Generates /srv/ai-tasks-data/.env.production if missing
#   4. Clones the repo to /srv/ai-tasks (using aitasks's SSH deploy key)
#   5. Sets up symlinks: data/, uploads/, .env.production → data dir
#   6. Installs aitasks-update + aitasks-backup to /usr/local/bin
#   7. Configures sudoers (NOPASSWD for those scripts + service restart)
#   8. Installs systemd: ai-tasks.service + ai-tasks-backup.timer (daily 03:00)
#   9. Configures Nginx vhost on $DOMAIN → 127.0.0.1:$PORT
#  10. Runs aitasks-update (first deploy)
#
# Env overrides (all optional):
#   REPO_URL=git@github.com:tsyeoh725/ai-tasks.git
#   DOMAIN=task.edgepoint.work
#   ADMIN_EMAIL=chewmunkai@gmail.com
#   PORT=3100
#   APP_DIR=/srv/ai-tasks
#   DATA_DIR=/srv/ai-tasks-data
#   APP_USER=aitasks
#   NODE_MAJOR=22
#   SKIP_FIRST_DEPLOY=1     don't run aitasks-update at the end

set -euo pipefail

REPO_URL="${REPO_URL:-git@github.com:tsyeoh725/ai-tasks.git}"
APP_DIR="${APP_DIR:-/srv/ai-tasks}"
DATA_DIR="${DATA_DIR:-/srv/ai-tasks-data}"
APP_USER="${APP_USER:-aitasks}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
SERVICE="${SERVICE:-ai-tasks}"
PORT="${PORT:-3100}"
DOMAIN="${DOMAIN:-task.edgepoint.work}"
ADMIN_EMAIL="${ADMIN_EMAIL:-chewmunkai@gmail.com}"
NODE_MAJOR="${NODE_MAJOR:-22}"
SKIP_FIRST_DEPLOY="${SKIP_FIRST_DEPLOY:-0}"

SRC_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

bold() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || fail "must run as root (use sudo)"

# ---------------------------------------------------------------- 1. system deps
bold "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git rsync sqlite3 nginx ca-certificates openssl >/dev/null

INSTALLED_MAJOR=0
command -v node >/dev/null && INSTALLED_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$INSTALLED_MAJOR" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
ok "node $(node -v) / npm $(npm -v)"

# ---------------------------------------------------------------- 2. user + data dirs
bold "Creating $APP_USER and data directories"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi
mkdir -p "$DATA_DIR"/{db,uploads,backups}
chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR"
chmod 750 "$DATA_DIR"
ok "data dir: $DATA_DIR"

# ---------------------------------------------------------------- 3. .env.production
bold "Setting up .env.production"
ENV_FILE="$DATA_DIR/.env.production"
ENV_GENERATED=0
if [ ! -f "$ENV_FILE" ]; then
  ENV_GENERATED=1
  NEXTAUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n=')
  API_KEY_SALT=$(openssl rand -hex 32)

  # VAPID keys (web push). Best-effort — non-fatal if it can't generate.
  VAPID_PUBLIC=""; VAPID_PRIVATE=""
  if VAPID_OUT=$(sudo -u "$APP_USER" -H bash -c "cd /tmp && npx --yes web-push generate-vapid-keys --json" 2>/dev/null); then
    VAPID_PUBLIC=$(echo "$VAPID_OUT" | grep -oE '"publicKey":"[^"]*"' | cut -d'"' -f4)
    VAPID_PRIVATE=$(echo "$VAPID_OUT" | grep -oE '"privateKey":"[^"]*"' | cut -d'"' -f4)
  fi

  cat > "$ENV_FILE" <<EOF
# ai-tasks — production environment
# Edit values then: sudo systemctl restart ai-tasks

NEXTAUTH_URL=https://$DOMAIN
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
AUTH_TRUST_HOST=true
API_KEY_SALT=$API_KEY_SALT
PORT=$PORT
NODE_ENV=production

# AI provider
OPENAI_API_KEY=${OPENAI_API_KEY:-}
AI_MODEL=${AI_MODEL:-gpt-4o-mini}

# Telegram (optional)
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}

# Web push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_SUBJECT=mailto:$ADMIN_EMAIL
EOF
  chown "$APP_USER:$APP_GROUP" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "generated $ENV_FILE"
else
  ok "$ENV_FILE preserved"
fi

# ---------------------------------------------------------------- 4. clone repo
bold "Setting up $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  if [ ! -f "/home/$APP_USER/.ssh/id_ed25519" ]; then
    fail "no SSH deploy key at /home/$APP_USER/.ssh/id_ed25519 — generate one and add to GitHub deploy keys first"
  fi
  rm -rf "$APP_DIR"
  mkdir -p "$(dirname "$APP_DIR")"
  sudo -u "$APP_USER" GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=accept-new' \
    git clone --quiet "$REPO_URL" "$APP_DIR"
  ok "cloned $REPO_URL → $APP_DIR"
else
  ok "$APP_DIR already a git checkout"
fi

# ---------------------------------------------------------------- 5. symlinks
bold "Wiring symlinks (data, uploads, .env.production)"
sudo -u "$APP_USER" bash -c "
  cd '$APP_DIR'
  rm -rf data uploads .env.production 2>/dev/null || true
  ln -sfn '$DATA_DIR/db'                 data
  ln -sfn '$DATA_DIR/uploads'            uploads
  ln -sfn '$DATA_DIR/.env.production'    .env.production
"
ok "symlinks point into $DATA_DIR"

# ---------------------------------------------------------------- 6. CLI commands
bold "Installing /usr/local/bin/aitasks-update + aitasks-backup"
install -m 755 "$SRC_DIR/deploy/aitasks-update" /usr/local/bin/aitasks-update
install -m 755 "$SRC_DIR/deploy/aitasks-backup" /usr/local/bin/aitasks-backup

# ---------------------------------------------------------------- 7. sudoers
bold "Configuring sudoers (NOPASSWD for aitasks → update/backup/restart)"
cat > /etc/sudoers.d/ai-tasks <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/local/bin/aitasks-update
$APP_USER ALL=(root) NOPASSWD: /usr/local/bin/aitasks-backup
$APP_USER ALL=(root) NOPASSWD: /bin/systemctl restart $SERVICE
EOF
chmod 440 /etc/sudoers.d/ai-tasks
visudo -c -q -f /etc/sudoers.d/ai-tasks || fail "sudoers file invalid"
ok "sudoers OK"

# ---------------------------------------------------------------- 8. systemd
bold "Installing systemd units"
install -m 644 "$SRC_DIR/deploy/ai-tasks.service"        /etc/systemd/system/ai-tasks.service
install -m 644 "$SRC_DIR/deploy/ai-tasks-backup.service" /etc/systemd/system/ai-tasks-backup.service
install -m 644 "$SRC_DIR/deploy/ai-tasks-backup.timer"   /etc/systemd/system/ai-tasks-backup.timer
systemctl daemon-reload
systemctl enable --quiet ai-tasks.service ai-tasks-backup.timer
systemctl start  ai-tasks-backup.timer
ok "ai-tasks.service + daily backup timer enabled"

# ---------------------------------------------------------------- 9. nginx
bold "Configuring Nginx vhost (HTTP only — TLS via Cloudflare Tunnel)"
NGX_FILE=/etc/nginx/sites-available/ai-tasks
cat > "$NGX_FILE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    client_max_body_size 50m;

    location = /sw.js {
        proxy_pass http://127.0.0.1:$PORT;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /uploads/ {
        alias $DATA_DIR/uploads/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        try_files \$uri =404;
    }

    location /_next/static/ {
        proxy_pass http://127.0.0.1:$PORT;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;

        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }
}
EOF
ln -sf "$NGX_FILE" /etc/nginx/sites-enabled/ai-tasks
nginx -t >/dev/null
systemctl reload nginx
ok "nginx vhost: $DOMAIN"

# ---------------------------------------------------------------- 10. first deploy
if [ "$SKIP_FIRST_DEPLOY" = "1" ]; then
  warn "SKIP_FIRST_DEPLOY=1 — not running aitasks-update"
elif grep -q '^OPENAI_API_KEY=$' "$ENV_FILE"; then
  warn "$ENV_FILE has empty OPENAI_API_KEY — fill it in (sudo -u aitasks nano $ENV_FILE) then run: sudo aitasks-update"
else
  bold "Running first deploy (aitasks-update)"
  /usr/local/bin/aitasks-update
fi

echo
ok "Bootstrap complete."
cat <<EOF

  Site:     https://$DOMAIN  (origin: 127.0.0.1:$PORT)
  Code:     $APP_DIR
  Data:     $DATA_DIR/{db,uploads,backups}
  Config:   $ENV_FILE
  Logs:     journalctl -u ai-tasks -f
  Update:   sudo aitasks-update
  Backup:   sudo aitasks-backup     (daily at 03:00 by timer)
EOF
