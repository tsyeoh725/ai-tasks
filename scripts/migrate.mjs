// Apply pending Drizzle migrations to the SQLite DB.
// Used by the container entrypoint on every start (idempotent).
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DB_PATH || "./data/ai-tasks.db";
const migrationsFolder = path.resolve(process.cwd(), "drizzle");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite);

try {
  migrate(db, { migrationsFolder });
  console.log("[migrate] ok — schema is up to date");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exit(1);
} finally {
  sqlite.close();
}
