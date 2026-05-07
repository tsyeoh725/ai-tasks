import { db } from "@/db";
import { clients, projects, clientInvoices, projectClients } from "@/db/schema";
import { and, eq, or, isNull, inArray, sql, type SQL } from "drizzle-orm";
import { teamMembers } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { resolveWorkspaceForUser } from "@/lib/workspace";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const ws = await resolveWorkspaceForUser(user.id!);
  let where: SQL | undefined;
  if (ws.kind === "personal") {
    where = and(eq(clients.ownerId, user.id!), isNull(clients.teamId));
  } else {
    where = eq(clients.teamId, ws.teamId);
  }
  if (status) where = and(where, eq(clients.status, status as "active" | "onboarding" | "paused" | "archived"));

  // F-12: trim listing fields. taxId, billingAddress, customFields, notes,
  // and contact details are not needed in a list view and should only be
  // returned by /api/clients/[id] (full detail) for owners/team members.
  const list = await db.query.clients.findMany({
    where,
    orderBy: (c, { asc }) => [asc(c.name)],
    limit: 200,
    columns: {
      id: true,
      name: true,
      logoUrl: true,
      brandColor: true,
      industry: true,
      status: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Attach quick stats
  const ids = list.map((c) => c.id);
  const names = list.map((c) => c.name);

  // Count via three linkage paths and combine to a distinct set per client:
  //   1) projects.clientId  (direct FK)
  //   2) project_clients junction (many-to-many)
  //   3) projects.category  (legacy text-based "client tag")
  const [byFk, byJunction, byCategory] = ids.length
    ? await Promise.all([
        db
          .select({ clientId: projects.clientId, projectId: projects.id })
          .from(projects)
          .where(inArray(projects.clientId, ids)),
        db
          .select({ clientId: projectClients.clientId, projectId: projectClients.projectId })
          .from(projectClients)
          .where(inArray(projectClients.clientId, ids)),
        db
          .select({ category: projects.category, projectId: projects.id })
          .from(projects)
          .where(inArray(projects.category, names)),
      ])
    : [[], [], []];

  // De-dupe project IDs per client
  const linkSets = new Map<string, Set<string>>();
  ids.forEach((id) => linkSets.set(id, new Set()));
  for (const row of byFk) if (row.clientId) linkSets.get(row.clientId)?.add(row.projectId);
  for (const row of byJunction) linkSets.get(row.clientId)?.add(row.projectId);
  // Resolve category text → client id via name
  const nameToId = new Map(list.map((c) => [c.name, c.id]));
  for (const row of byCategory) {
    if (row.category) {
      const cid = nameToId.get(row.category);
      if (cid) linkSets.get(cid)?.add(row.projectId);
    }
  }

  const outstanding = ids.length
    ? await db
        .select({ clientId: clientInvoices.clientId, total: sql<number>`sum(${clientInvoices.amount})`.mapWith(Number) })
        .from(clientInvoices)
        .where(and(inArray(clientInvoices.clientId, ids), or(eq(clientInvoices.status, "sent"), eq(clientInvoices.status, "overdue"))))
        .groupBy(clientInvoices.clientId)
    : [];

  const outMap = new Map(outstanding.map((p) => [p.clientId, p.total]));

  return NextResponse.json({
    clients: list.map((c) => ({
      ...c,
      _projectCount: linkSets.get(c.id)?.size ?? 0,
      _outstandingBalance: outMap.get(c.id) ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Default teamId to the active workspace when client is created from a
  // team workspace; explicit body.teamId still wins (verified below).
  const ws = await resolveWorkspaceForUser(user.id!);
  let resolvedTeamId: string | null = (body.teamId as string) || null;
  if (!resolvedTeamId && ws.kind === "team") resolvedTeamId = ws.teamId;
  if (resolvedTeamId) {
    const member = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, resolvedTeamId), eq(teamMembers.userId, user.id!)),
    });
    if (!member) return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }

  const id = uuid();
  const now = new Date();
  await db.insert(clients).values({
    id,
    ownerId: user.id!,
    teamId: resolvedTeamId,
    name,
    logoUrl: (body.logoUrl as string) || null,
    brief: (body.brief as string) || null,
    brandColor: (body.brandColor as string) || "#99ff33",
    contactName: (body.contactName as string) || null,
    contactEmail: (body.contactEmail as string) || null,
    contactPhone: (body.contactPhone as string) || null,
    whatsapp: (body.whatsapp as string) || null,
    website: (body.website as string) || null,
    industry: (body.industry as string) || null,
    billingAddress: (body.billingAddress as string) || null,
    taxId: (body.taxId as string) || null,
    currency: (body.currency as string) || "MYR",
    status: (["active", "onboarding", "paused", "archived"].includes(body.status as string) ? body.status as "active" | "onboarding" | "paused" | "archived" : "active"),
    services: Array.isArray(body.services) ? JSON.stringify(body.services) : (typeof body.services === "string" ? body.services : "[]"),
    customFields: typeof body.customFields === "object" ? JSON.stringify(body.customFields) : "{}",
    notes: (body.notes as string) || null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  return NextResponse.json(created, { status: 201 });
}
