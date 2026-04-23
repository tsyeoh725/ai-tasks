import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import {
  runMonitorCycleForBrand,
  type MonitorCycleResult,
} from "@/lib/marketing/core-monitor";
import {
  generateTasksFromAdHealth,
  type DetectedCondition,
  type DetectedConditionKind,
} from "@/lib/marketing/task-generator";

function mapRecommendationToKind(action: string): DetectedConditionKind | null {
  // Map monitor recommendations to task-generator conditions where sensible.
  switch (action) {
    case "kill":
      return "ai_guard_killed";
    case "pause":
      return "ctr_below_threshold_3d";
    case "duplicate":
    case "boost_budget":
      return null; // no task needed — the executor handles those directly
    default:
      return null;
  }
}

async function authorize(req: Request): Promise<
  | { userId: string; cron: false }
  | { userId: null; cron: true }
  | { error: NextResponse }
> {
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && cronSecretHeader === envSecret) {
    return { userId: null, cron: true };
  }
  const user = await getSessionUser();
  if (user) return { userId: user.id, cron: false };
  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

// POST /api/cron/monitor  { brandId? }
export async function POST(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { brandId?: string };
  const targetBrandId = body.brandId;

  // Determine the brands to scan.
  let targets: Array<{ id: string; userId: string; name: string; projectId: string | null }> = [];

  if (targetBrandId) {
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, targetBrandId) });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    // Session callers are restricted to their own brands; cron secret can run anything.
    if (!auth.cron && brand.userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targets = [
      { id: brand.id, userId: brand.userId, name: brand.name, projectId: brand.projectId },
    ];
  } else if (auth.cron) {
    const all = await db.query.brands.findMany({ where: eq(brands.isActive, true) });
    targets = all.map((b) => ({ id: b.id, userId: b.userId, name: b.name, projectId: b.projectId }));
  } else {
    const mine = await db.query.brands.findMany({
      where: eq(brands.userId, auth.userId),
    });
    targets = mine.map((b) => ({ id: b.id, userId: b.userId, name: b.name, projectId: b.projectId }));
  }

  if (targets.length === 0) {
    return NextResponse.json({ message: "No brands to scan", results: [] });
  }

  const results: Array<MonitorCycleResult & { tasks?: { created: number; skipped: number } }> = [];

  for (const target of targets) {
    let cycleResult: MonitorCycleResult;
    try {
      cycleResult = await runMonitorCycleForBrand(target.id);
    } catch (err) {
      cycleResult = {
        brandId: target.id,
        brandName: target.name,
        recommendationsCount: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
        actionsTaken: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
        verdicts: [],
      };
    }

    // Derive DetectedConditions from verdicts and feed them to task-generator.
    const conditions: DetectedCondition[] = [];
    for (const v of cycleResult.verdicts) {
      const kind = mapRecommendationToKind(v.recommendation.action);
      if (!kind) continue;
      conditions.push({
        kind,
        adName: v.recommendation.adName,
        brandName: cycleResult.brandName,
        context: {
          reason: v.recommendation.reason,
          verdict: v.verdict.verdict,
          kpiValues: v.recommendation.kpiValues,
        },
      });
    }

    let taskResult: { created: number; skipped: number } = { created: 0, skipped: 0 };
    if (conditions.length > 0) {
      taskResult = await generateTasksFromAdHealth(target.userId, target.id, conditions);
    }

    results.push({ ...cycleResult, tasks: taskResult });
  }

  return NextResponse.json({ message: "Monitor cycle complete", results });
}

