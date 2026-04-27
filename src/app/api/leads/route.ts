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

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = (body.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const id = uuid();
  const now = new Date();
  await db.insert(leads).values({
    id,
    ownerId: user.id!,
    teamId: body.teamId || null,
    name,
    email: body.email || null,
    phone: body.phone || null,
    company: body.company || null,
    website: body.website || null,
    jobTitle: body.jobTitle || null,
    source: ALLOWED_SOURCE.includes(body.source) ? body.source : "manual",
    sourceDetail: body.sourceDetail || null,
    status: ALLOWED_STATUS.includes(body.status) ? body.status : "new",
    estimatedValue: body.estimatedValue ? Number(body.estimatedValue) : null,
    currency: body.currency || "USD",
    services: typeof body.services === "object" ? JSON.stringify(body.services) : "[]",
    notes: body.notes || null,
    tags: typeof body.tags === "object" ? JSON.stringify(body.tags) : "[]",
    customFields: typeof body.customFields === "object" ? JSON.stringify(body.customFields) : "{}",
    nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
    assignedToId: body.assignedToId || null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  return NextResponse.json(created, { status: 201 });
}
