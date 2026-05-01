#!/usr/bin/env bash
# Back up the SQLite DB using the online backup API (safe while the app is running).
#
# Usage:
#   bash deploy/backup-db.sh
#
# Cron example (as aitasks user, daily at 03:15):
#   15 3 * * * /usr/bin/bash /srv/ai-tasks/deploy/backup-db.sh >> /srv/ai-tasks/data/backup.log 2>&1
#
# Retention: keeps the 14 most recent backups. Adjust KEEP below.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/ai-tasks}"
DB="${APP_DIR}/data/ai-tasks.db"
BACKUP_DIR="${APP_DIR}/data/backups"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB" ]]; then
    echo "No database at $DB — nothing to back up." >&2
    exit 0
fi

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="${BACKUP_DIR}/ai-tasks-${STAMP}.db"

# sqlite3 ".backup" uses the online backup API — safe under concurrent writes.
if command -v sqlite3 >/dev/null; then
    sqlite3 "$DB" ".backup '$OUT'"
else
    # Fallback: copy + WAL checkpoint. Slightly riskier but better than nothing.
    cp -a "$DB" "$OUT"
fi

# Compress
gzip -f "$OUT"

# Prune
ls -1t "${BACKUP_DIR}"/ai-tasks-*.db.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date -Is)  backup saved: ${OUT}.gz"
