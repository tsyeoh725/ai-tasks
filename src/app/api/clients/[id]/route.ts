import { db } from "@/db";
import { clients, projects, clientInvoices, clientPayments, projectClients } from "@/db/schema";
import { eq, and, sql, or, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";

const ALLOWED_STATUS = ["active", "onboarding", "paused", "archived"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve all project IDs linked to this client (FK + junction + legacy category-by-name)
  const junctionRows = await db.query.projectClients.findMany({
    where: eq(projectClients.clientId, id),
    columns: { projectId: true },
  });
  const linkedProjectIds = new Set<string>(junctionRows.map((r) => r.projectId));
  const fkRows = await db.query.projects.findMany({
    where: eq(projects.clientId, id),
    columns: { id: true },
  });
  fkRows.forEach((r) => linkedProjectIds.add(r.id));
  // Legacy: projects whose `category` text equals this client's name
  const legacyRows = await db.query.projects.findMany({
    where: eq(projects.category, client.name),
    columns: { id: true },
  });
  legacyRows.forEach((r) => linkedProjectIds.add(r.id));

  const allLinkedIds = Array.from(linkedProjectIds);

  // Stats
  const [projs, invoices, payments] = await Promise.all([
    allLinkedIds.length
      ? db.query.projects.findMany({
          where: inArray(projects.id, allLinkedIds),
          columns: { id: true, name: true, color: true, icon: true, campaign: true, updatedAt: true },
          orderBy: (p, { desc }) => [desc(p.updatedAt)],
        })
      : Promise.resolve([] as Array<{ id: string; name: string; color: string; icon: string | null; campaign: string | null; updatedAt: Date }>),
    db.select({
      total: sql<number>`coalesce(sum(${clientInvoices.amount}),0)`.mapWith(Number),
      paid: sql<number>`coalesce(sum(case when ${clientInvoices.status} = 'paid' then ${clientInvoices.amount} else 0 end),0)`.mapWith(Number),
      outstanding: sql<number>`coalesce(sum(case when ${clientInvoices.status} in ('sent','overdue') then ${clientInvoices.amount} else 0 end),0)`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(case when ${clientInvoices.status} = 'overdue' then ${clientInvoices.amount} else 0 end),0)`.mapWith(Number),
    }).from(clientInvoices).where(eq(clientInvoices.clientId, id)),
    db.select({ totalReceived: sql<number>`coalesce(sum(${clientPayments.amount}),0)`.mapWith(Number) })
      .from(clientPayments).where(eq(clientPayments.clientId, id)),
  ]);

  return NextResponse.json({
    ...client,
    stats: {
      projectCount: projs.length,
      totalInvoiced: invoices[0]?.total ?? 0,
      totalPaid: invoices[0]?.paid ?? 0,
      outstandingBalance: invoices[0]?.outstanding ?? 0,
      overdueBalance: invoices[0]?.overdue ?? 0,
      totalReceived: payments[0]?.totalReceived ?? 0,
    },
    projects: projs,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const str = (k: string) => { if (body[k] !== undefined) updates[k] = body[k]; };
  ["name","logoUrl","brief","brandColor","contactName","contactEmail","contactPhone","whatsapp","website","industry","billingAddress","taxId","currency","notes"].forEach(str);
  if (body.status && ALLOWED_STATUS.includes(body.status as never)) updates.status = body.status;
  if (body.customFields !== undefined) {
    updates.customFields = typeof body.customFields === "string" ? body.customFields : JSON.stringify(body.customFields);
  }

  await db.update(clients).set(updates).where(eq(clients.id, id));
  const updated = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(clients).where(eq(clients.id, id));
  return NextResponse.json({ success: true });
}
