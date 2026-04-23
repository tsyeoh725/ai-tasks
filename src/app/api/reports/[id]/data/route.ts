import { db } from "@/db";
import {
  reports,
  tasks,
  portfolios,
  goals,
  teamMembers,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { getAccessibleProjectIds, getAccessibleProjects } from "@/lib/queries/projects";

type Widget = {
  id: string;
  type: "column" | "line" | "donut" | "number" | "lollipop" | "burnup";
  source: "tasks" | "projects" | "portfolios" | "goals";
  title: string;
  xAxis?: string;
  yAxis?: string;
  aggregation: "count" | "sum" | "avg";
  groupBy?: string;
  filters?: Array<{ field: string; op: string; value: unknown }>;
  width: number;
  height: number;
};

type Row = Record<string, unknown>;

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function applyFilters(rows: Row[], filters: Widget["filters"]): Row[] {
  if (!filters || filters.length === 0) return rows;
  return rows.filter((row) => {
    for (const f of filters) {
      const v = row[f.field];
      switch (f.op) {
        case "eq":
          if (v !== f.value) return false;
          break;
        case "neq":
          if (v === f.value) return false;
          break;
        case "gt":
          if (!(typeof v === "number" && typeof f.value === "number" && v > f.value)) return false;
          break;
        case "lt":
          if (!(typeof v === "number" && typeof f.value === "number" && v < f.value)) return false;
          break;
        case "in":
          if (!Array.isArray(f.value) || !f.value.includes(v)) return false;
          break;
        case "is_null":
          if (v != null) return false;
          break;
        case "not_null":
          if (v == null) return false;
          break;
        default:
          break;
      }
    }
    return true;
  });
}

function groupAndAggregate(
  rows: Row[],
  groupBy: string | undefined,
  aggregation: Widget["aggregation"],
  yAxis: string | undefined
): { label: string; value: number }[] {
  if (!groupBy) {
    return [{ label: "Total", value: singleAggregate(rows, aggregation, yAxis) }];
  }

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const raw = row[groupBy];
    const label =
      raw == null
        ? "None"
        : raw instanceof Date
        ? raw.toISOString().slice(0, 10)
        : String(raw);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(row);
  }

  return Array.from(groups.entries())
    .map(([label, groupRows]) => ({
      label,
      value: singleAggregate(groupRows, aggregation, yAxis),
    }))
    .sort((a, b) => b.value - a.value);
}

function singleAggregate(
  rows: Row[],
  aggregation: Widget["aggregation"],
  yAxis: string | undefined
): number {
  if (aggregation === "count") return rows.length;
  if (!yAxis) return rows.length;

  const numbers = rows
    .map((r) => r[yAxis])
    .filter((v): v is number => typeof v === "number");

  if (numbers.length === 0) return 0;

  if (aggregation === "sum") {
    return numbers.reduce((a, b) => a + b, 0);
  }
  if (aggregation === "avg") {
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }
  return 0;
}

async function fetchRows(source: Widget["source"], userId: string): Promise<Row[]> {
  if (source === "tasks") {
    const projectIds = await getAccessibleProjectIds(userId);
    if (projectIds.length === 0) return [];
    const result = await db.query.tasks.findMany({
      where: inArray(tasks.projectId, projectIds),
    });
    return result.map((t) => ({ ...t })) as Row[];
  }

  if (source === "projects") {
    const result = await getAccessibleProjects(userId);
    return result.map((p) => ({ ...p })) as Row[];
  }

  if (source === "portfolios") {
    const result = await db.query.portfolios.findMany({
      where: eq(portfolios.ownerId, userId),
    });
    return result.map((p) => ({ ...p })) as Row[];
  }

  if (source === "goals") {
    const result = await db.query.goals.findMany({
      where: eq(goals.ownerId, userId),
    });
    return result.map((g) => ({ ...g })) as Row[];
  }

  return [];
}

async function computeBurnup(
  source: Widget["source"],
  userId: string,
  filters: Widget["filters"]
) {
  // Tasks-only burnup is meaningful; for other sources fall back to empty scaffold.
  if (source !== "tasks") {
    return { data: [] };
  }

  const rows = applyFilters(await fetchRows(source, userId), filters);

  // Build day buckets spanning the last 30 days from today back.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const DAY = 86400000;
  const DAYS = 30;

  const days: { date: string; created: Date }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(startOfToday.getTime() - i * DAY);
    days.push({
      date: d.toISOString().slice(0, 10),
      created: d,
    });
  }

  const data = days.map(({ date, created }) => {
    const endOfDay = new Date(created.getTime() + DAY);
    let total = 0;
    let completed = 0;
    for (const row of rows) {
      const createdAt = toDate(row["createdAt"]);
      const completedAt = toDate(row["completedAt"]);
      if (createdAt && createdAt < endOfDay) total++;
      if (completedAt && completedAt < endOfDay) completed++;
    }
    return { date, completed, total };
  });

  return { data };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Verify access to the report (owner or team member).
  const report = await db.query.reports.findFirst({
    where: eq(reports.id, id),
  });
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (report.ownerId !== user.id) {
    if (!report.teamId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, report.teamId),
        eq(teamMembers.userId, user.id)
      ),
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const body = await req.json();
  const widget = body.widget as Widget | undefined;
  if (!widget) {
    return NextResponse.json({ error: "widget is required" }, { status: 400 });
  }

  if (widget.type === "burnup") {
    const result = await computeBurnup(widget.source, user.id, widget.filters);
    return NextResponse.json(result);
  }

  const rows = applyFilters(await fetchRows(widget.source, user.id), widget.filters);

  if (widget.type === "number") {
    const value = singleAggregate(rows, widget.aggregation, widget.yAxis);
    return NextResponse.json({ value });
  }

  const data = groupAndAggregate(
    rows,
    widget.groupBy,
    widget.aggregation,
    widget.yAxis
  );
  return NextResponse.json({ data });
}
