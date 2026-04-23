// Learning Agent — ported from jarvis/src/lib/agents/learning-agent.ts
// Periodically summarizes decisions for a brand and records them as
// agentMemory (weekly_summary). Also exposes addPreference() for user-provided
// preferences that flow into AI Guard context.
import { db } from "@/db";
import { and, eq, gte, inArray } from "drizzle-orm";
// NOTE: Expected camelCase Drizzle tables (added by the parallel schema task):
//   brands, decisionJournal, agentMemory.
import { brands, decisionJournal, agentMemory } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { generateWeeklySummary } from "@/lib/marketing/claude-guard";
import { log } from "@/lib/marketing/logger";

const MAX_MEMORY_PER_TYPE = 20;

export async function generateWeeklyReportForBrand(brandId: string): Promise<string | null> {
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) return null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const decisions = await db.query.decisionJournal.findMany({
    where: and(eq(decisionJournal.brandId, brandId), gte(decisionJournal.createdAt, sevenDaysAgo)),
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });
  if (decisions.length === 0) return null;

  const normalized = decisions.map((d) => {
    const row = d as unknown as {
      recommendation: string;
      guardVerdict: string;
      actionTaken: boolean;
      reason: string;
      createdAt: Date;
    };
    return {
      recommendation: row.recommendation,
      guardVerdict: row.guardVerdict,
      actionTaken: row.actionTaken,
      reason: row.reason,
      createdAt: row.createdAt,
    };
  });

  const summary = await generateWeeklySummary(brand.name, normalized);

  await db.insert(agentMemory).values({
    id: uuid(),
    userId: (brand as unknown as { userId: string }).userId,
    brandId,
    memoryType: "weekly_summary",
    content: summary,
    createdAt: new Date(),
  });

  await pruneMemory(brandId, "weekly_summary");
  log("info", "learning", `Weekly summary generated for ${brand.name}`, {
    decisions: decisions.length,
    summaryLength: summary.length,
  });

  return summary;
}

/**
 * Add a user-provided preference (free text) into agentMemory.
 * The AI Guard reads recent memory when evaluating recommendations.
 */
export async function addPreference(
  brandId: string,
  userId: string,
  preference: string,
): Promise<void> {
  await db.insert(agentMemory).values({
    id: uuid(),
    userId,
    brandId,
    memoryType: "preference",
    content: preference,
    createdAt: new Date(),
  });
  await pruneMemory(brandId, "preference");
}

export async function getMemoryForBrand(brandId: string, limit = 10) {
  return db.query.agentMemory.findMany({
    where: eq(agentMemory.brandId, brandId),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
    limit,
  });
}

async function pruneMemory(
  brandId: string,
  memoryType: "weekly_summary" | "preference" | "pattern",
): Promise<void> {
  const memories = await db.query.agentMemory.findMany({
    where: and(eq(agentMemory.brandId, brandId), eq(agentMemory.memoryType, memoryType)),
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  if (memories.length <= MAX_MEMORY_PER_TYPE) return;

  const toDelete = memories.slice(MAX_MEMORY_PER_TYPE).map((m) => m.id);
  if (toDelete.length > 0) {
    await db.delete(agentMemory).where(inArray(agentMemory.id, toDelete));
  }
}
