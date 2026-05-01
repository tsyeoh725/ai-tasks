#!/bin/sh
# ai-tasks container entrypoint:
#   1. Ensure DB and uploads directories exist (data is bind-mounted from host)
#   2. Run pending Drizzle migrations against the SQLite DB
#   3. Hand off to the main process (CMD)
set -e

DB_PATH="${DB_PATH:-/data/ai-tasks.db}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"

mkdir -p "$(dirname "$DB_PATH")" "$UPLOADS_DIR"

echo "[entrypoint] DB_PATH=$DB_PATH"
echo "[entrypoint] UPLOADS_DIR=$UPLOADS_DIR"
echo "[entrypoint] running drizzle migrations..."
node scripts/migrate.mjs

echo "[entrypoint] starting: $*"
exec "$@"
