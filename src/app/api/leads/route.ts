import { db } from "@/db";
import { leads, teamMembers } from "@/db/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

const ALLOWED_STATUS = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost", "nurture"] as const;
const ALLOWED_SOURCE = ["inbound", "outbound", "referral", "social", "website", "event", "import", "manual"] as const;

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const source = searchParams.get("source");

  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id!),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);
  const conds = [and(eq(leads.ownerId, user.id!), isNull(leads.teamId))];
  if (teamIds.length > 0) conds.push(inArray(leads.teamId, teamIds));
  let where = or(...conds);
  if (status && ALLOWED_STATUS.includes(status as never)) {
    where = and(where, eq(leads.status, status as typeof ALLOWED_STATUS[number]));
  }
  if (source && ALLOWED_SOURCE.includes(source as never)) {
    where = and(where, eq(leads.source, source as typeof ALLOWED_SOURCE[number]));
  }

  const list = await db.query.leads.findMany({
    where,
    orderBy: (l, { desc }) => [desc(l.createdAt)],
    limit: 500,
    with: {
      assignedTo: { columns: { id: true, name: true } },
      convertedClient: { columns: { id: true, name: true } },
    },
  });

  return NextResponse.json({ leads: list });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const asString = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const asDateOrNull = (v: unknown): Date | null => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v;
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const sourceCandidate = typeof body.source === "string" ? body.source : "";
  const statusCandidate = typeof body.status === "string" ? body.status : "";
  const source = (ALLOWED_SOURCE as readonly string[]).includes(sourceCandidate)
    ? (sourceCandidate as typeof ALLOWED_SOURCE[number])
    : "manual";
  const status = (ALLOWED_STATUS as readonly string[]).includes(statusCandidate)
    ? (statusCandidate as typeof ALLOWED_STATUS[number])
    : "new";

  const id = uuid();
  const now = new Date();
  await db.insert(leads).values({
    id,
    ownerId: user.id!,
    teamId: asString(body.teamId),
    name,
    email: asString(body.email),
    phone: asString(body.phone),
    company: asString(body.company),
    website: asString(body.website),
    jobTitle: asString(body.jobTitle),
    source,
    sourceDetail: asString(body.sourceDetail),
    status,
    estimatedValue: body.estimatedValue ? Number(body.estimatedValue) : null,
    currency: asString(body.currency) ?? "USD",
    services: typeof body.services === "object" && body.services !== null ? JSON.stringify(body.services) : "[]",
    notes: asString(body.notes),
    tags: typeof body.tags === "object" && body.tags !== null ? JSON.stringify(body.tags) : "[]",
    customFields: typeof body.customFields === "object" && body.customFields !== null ? JSON.stringify(body.customFields) : "{}",
    nextFollowUpAt: asDateOrNull(body.nextFollowUpAt),
    assignedToId: asString(body.assignedToId),
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  return NextResponse.json(created, { status: 201 });
}
