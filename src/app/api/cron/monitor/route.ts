import { db } from "@/db";
import { brands } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  runMonitorCycleForBrand,
  type MonitorCycleResult,
} from "@/lib/marketing/core-monitor";
import {
  generateTasksFromAdHealth,
  type DetectedCondition,
  type DetectedConditionKind,
} from "@/lib/marketing/task-generator";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere, canAccessBrand } from "@/lib/brand-access";
import { flushLogs, log } from "@/lib/marketing/logger";
import { startJob } from "@/lib/jobs";
import { authorizeCron } from "@/lib/cron-auth";

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

const authorize = authorizeCron;

// POST /api/cron/monitor  { brandId? }
export async function POST(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;

  // brandId can come from either the JSON body (cron + script callers) or
  // the URL query string (the brand-detail page's "Run monitor now" button).
  const body = (await req.json().catch(() => ({}))) as { brandId?: string };
  const url = new URL(req.url);
  const targetBrandId = body.brandId || url.searchParams.get("brandId") || undefined;

  // Determine the brands to scan.
  let targets: Array<{ id: string; userId: string; name: string; projectId: string | null }> = [];

  if (targetBrandId) {
    const brand = await db.query.brands.findFirst({ where: eq(brands.id, targetBrandId) });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    // Session callers must have workspace access; cron secret can run anything.
    if (!auth.cron && !(await canAccessBrand(brand, auth.userId!))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    targets = [
      { id: brand.id, userId: brand.userId, name: brand.name, projectId: brand.projectId },
    ];
  } else if (auth.cron) {
    const all = await db.query.brands.findMany({ where: eq(brands.isActive, true) });
    targets = all.map((b) => ({ id: b.id, userId: b.userId, name: b.name, projectId: b.projectId }));
  } else {
    const ws = await resolveWorkspaceForUser(auth.userId!);
    const accessible = await db.query.brands.findMany({
      where: and(brandsAccessibleWhere(ws, auth.userId!), eq(brands.isActive, true))!,
    });
    targets = accessible.map((b) => ({ id: b.id, userId: b.userId, name: b.name, projectId: b.projectId }));
  }

  if (targets.length === 0) {
    return NextResponse.json({ message: "No brands to scan", results: [] });
  }

  // UI-triggered runs go to the background so the operator can navigate away;
  // cron-triggered runs stay synchronous so the scheduler can log the outcome.
  const runAudit = () => runAuditTargets(targets);

  if (!auth.cron && auth.userId) {
    const handle = await startJob({
      userId: auth.userId,
      type: "monitor_audit",
      label:
        targets.length === 1
          ? `Audit — ${targets[0].name}`
          : `Audit — ${targets.length} brands`,
      payload: { brandIds: targets.map((t) => t.id) },
      work: runAudit,
    });
    return NextResponse.json(
      { queued: true, jobId: handle.jobId, brandCount: targets.length },
      { status: 202 },
    );
  }

  const results = await runAudit();
  return NextResponse.json({ message: "Monitor cycle complete", results });
}

async function runAuditTargets(
  targets: Array<{ id: string; userId: string; name: string; projectId: string | null }>,
) {
  const results: Array<MonitorCycleResult & { tasks?: { created: number; skipped: number } }> = [];

  // Group log flushes per (user, audit run) so the Logs page surfaces this run
  // as one expandable "session" card. Cron-triggered runs get one session per
  // brand (since each brand may belong to a different user); UI-triggered
  // runs share a single session id per click.
  //
  // F-77 (audit-random-bug-fix): use a `cycle-` prefix instead of `audit-`
  // so a multi-brand cycle is recognisable as one logical run in the Logs
  // UI (substring filter on "cycle-<ts>" pulls every brand together). The
  // previous label `audit-<ts>-<brandId>` plus a parent context log that
  // got buffered into only the *first* brand's session was misleading —
  // the parent message no longer races the per-brand flush because we now
  // log it INSIDE each brand iteration with its own context.
  const cyclePrefix = `cycle-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  for (const target of targets) {
    log("info", "monitor", `Cycle started for ${target.name}`, {
      cyclePrefix,
      brandCount: targets.length,
      allBrands: targets.map((t) => t.name),
    });
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

    // Flush per-brand so logs are persisted under the brand's owner. Cron
    // runs may scan brands across multiple users; each gets its own session
    // row keyed by user. The shared `cyclePrefix` makes "all brands in this
    // run" filterable as one substring search in the Logs UI.
    await flushLogs(`${cyclePrefix}-${target.id}`, target.userId);
  }

  return results;
}

