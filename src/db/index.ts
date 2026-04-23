import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbPath = path.join(process.cwd(), "data", "ai-tasks.db");

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Use a global singleton to avoid multiple connections
const globalForDb = globalThis as unknown as {
  sqlite: Database.Database | undefined;
};

if (!globalForDb.sqlite) {
  globalForDb.sqlite = new Database(dbPath);
  globalForDb.sqlite.pragma("journal_mode = WAL");
  globalForDb.sqlite.pragma("foreign_keys = ON");
  globalForDb.sqlite.pragma("busy_timeout = 5000");
}

export const db = drizzle(globalForDb.sqlite, { schema });
export { schema };
