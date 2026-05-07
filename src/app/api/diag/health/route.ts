// ─── Container healthcheck ───────────────────────────────────────────────────
// Public, boolean-only endpoint that exercises the actual critical path:
//   1. SQLite is reachable and answers `SELECT 1`
//   2. The DB file exists at DB_PATH (catches the case where the bind mount
//      is wrong but Next still answers HTTP)
//
// SL-10: the previous healthcheck pointed at /api/auth/session which returns
// {} for an empty session even when SQLite is corrupt — container reported
// healthy while every write failed. Use this endpoint instead from
// docker-compose.yml and the Dockerfile HEALTHCHECK directive.

import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Throws if SQLite is corrupt, locked too long, or the DB module failed
    // to initialize. `db.run` returns a RunResult; we don't read it.
    db.run(sql`SELECT 1`);

    const dbPath = process.env.DB_PATH || "/data/ai-tasks.db";
    if (!existsSync(dbPath)) {
      return NextResponse.json(
        { ok: false, error: "db_path_missing" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
