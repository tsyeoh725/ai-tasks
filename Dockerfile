# syntax=docker/dockerfile:1.7

# ────────────────────────────────────────────────────────────
#  ai-tasks — production Docker image
#  Multi-stage build:
#    1. deps    — install npm packages (incl. native better-sqlite3 build)
#    2. builder — `next build` with standalone output
#    3. runner  — minimal runtime image (~150 MB)
# ────────────────────────────────────────────────────────────

ARG NODE_VERSION=22-bookworm-slim

# ---- 1. deps ----
FROM node:${NODE_VERSION} AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# ---- 2. builder ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. runner ----
FROM node:${NODE_VERSION} AS runner
# tzdata so /usr/share/zoneinfo/* exists. Without it, setting TZ has no
# effect — the kernel falls back to UTC and Intl.DateTimeFormat() returns
# UTC inside the container even when a TZ env is provided.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl tini sqlite3 tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Default the container to MYT. Without this, Node sees UTC and the Jarvis
# date parser falls back to UTC for users without a saved timezone — which
# made "create at 5 PM" land at 1 AM MYT (5 PM UTC = 1 AM MYT). Override
# via docker compose env_file / environment if deploying to a different
# region.
ENV TZ=Asia/Kuala_Lumpur

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
ENV DB_PATH=/data/ai-tasks.db
ENV UPLOADS_DIR=/data/uploads

# Standalone Next output (server.js + minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Migration assets — drizzle-orm gets bundled into Next's server chunks and
# isn't exposed in standalone/node_modules, so the migrate script needs it
# copied explicitly. better-sqlite3 (native) is already in standalone.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Entrypoint
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Drop privileges
RUN groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs -s /bin/bash -m nextjs \
    && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3100/api/diag/health > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
