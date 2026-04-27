import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    // Same env var as src/db/index.ts. In production this points to
    // /srv/ai-tasks-data/db/ai-tasks.db (outside the deploy dir).
    url: process.env.DB_PATH ?? "./data/ai-tasks.db",
  },
});
