import { db } from "@/db";
import { cycleRuns } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";

// GET /api/automation/cycles?limit=30
// Returns recent cycle steps grouped by cycleId. Each cycle has a brand,
// a trigger, and one row per step (sync/audit). UI renders these as a
// vertical pipeline timeline.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 1), 200);

  const ws = await resolveWorkspaceForUser(user.id);
  const accessible = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true, name: true },
  });
  if (accessible.length === 0) return NextResponse.json({ cycles: [] });

  const brandIds = accessible.map((b) => b.id);
  const nameById = new Map(accessible.map((b) => [b.id, b.name]));

  // Pull a wider slice of step rows than we actually need, then fold them
  // into cycles. We trim to `limit` cycles after grouping so the response
  // is bounded regardless of step count per cycle.
  const rows = await db.query.cycleRuns.findMany({
    where: inArray(cycleRuns.brandId, brandIds),
    orderBy: [desc(cycleRuns.createdAt)],
    limit: limit * 5,
  });

  type CycleStep = {
    step: string;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
    result: unknown;
  };
  type Cycle = {
    cycleId: string;
    brandId: string;
    brandName: string;
    trigger: string;
    createdAt: string;
    steps: CycleStep[];
  };

  const grouped = new Map<string, Cycle>();
  for (const r of rows) {
    let parsedResult: unknown = null;
    if (r.result) {
      try {
        parsedResult = JSON.parse(r.result);
      } catch {}
    }
    const step: CycleStep = {
      step: r.step,
      status: r.status,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      error: r.error,
      result: parsedResult,
    };
    const existing = grouped.get(r.cycleId);
    if (existing) {
      existing.steps.push(step);
    } else {
      grouped.set(r.cycleId, {
        cycleId: r.cycleId,
        brandId: r.brandId,
        brandName: nameById.get(r.brandId) ?? "Unknown brand",
        trigger: r.trigger,
        createdAt: r.createdAt.toISOString(),
        steps: [step],
      });
    }
  }

  const cycles = Array.from(grouped.values())
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);

  // Stable step order: sync first, audit second.
  const order = { sync: 0, audit: 1, execute: 2 } as Record<string, number>;
  for (const c of cycles) {
    c.steps.sort((a, b) => (order[a.step] ?? 9) - (order[b.step] ?? 9));
  }

  return NextResponse.json({ cycles });
}
