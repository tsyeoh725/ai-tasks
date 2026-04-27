import { db } from "@/db";
import { leads, teamMembers, leadActivities } from "@/db/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

const ALLOWED_STATUS = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost", "nurture"] as const;

async function canAccessLead(leadId: string, userId: string): Promise<{ ok: boolean; lead?: typeof leads.$inferSelect }> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return { ok: false };
  if (lead.ownerId === userId) return { ok: true, lead };
  if (lead.teamId) {
    const m = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, lead.teamId), eq(teamMembers.userId, userId)),
      columns: { id: true },
    });
    if (m) return { ok: true, lead };
  }
  return { ok: false };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await canAccessLead(id, user.id!);
  if (!access.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: {
      assignedTo: { columns: { id: true, name: true, email: true } },
      convertedClient: { columns: { id: true, name: true } },
      activities: {
        orderBy: (a, { desc }) => [desc(a.createdAt)],
        with: { user: { columns: { id: true, name: true } } },
      },
    },
  });
  return NextResponse.json(lead);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await canAccessLead(id, user.id!);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  ["name", "email", "phone", "company", "website", "jobTitle", "sourceDetail", "notes", "currency"].forEach((k) => {
    if (body[k] !== undefined) updates[k] = body[k] || null;
  });
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    updates.status = body.status;

    // Log status change as activity
    if (access.lead && body.status !== access.lead.status) {
      await db.insert(leadActivities).values({
        id: uuid(),
        leadId: id,
        userId: user.id!,
        type: "status_change",
        content: `${access.lead.status} → ${body.status}`,
        createdAt: new Date(),
      });
    }
  }
  if (body.estimatedValue !== undefined) updates.estimatedValue = body.estimatedValue ? Number(body.estimatedValue) : null;
  if (body.services !== undefined) updates.services = typeof body.services === "string" ? body.services : JSON.stringify(body.services);
  if (body.tags !== undefined) updates.tags = typeof body.tags === "string" ? body.tags : JSON.stringify(body.tags);
  if (body.customFields !== undefined) updates.customFields = typeof body.customFields === "string" ? body.customFields : JSON.stringify(body.customFields);
  if (body.assignedToId !== undefined) updates.assignedToId = body.assignedToId || null;
  if (body.lastContactedAt !== undefined) updates.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : null;
  if (body.nextFollowUpAt !== undefined) updates.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null;

  await db.update(leads).set(updates).where(eq(leads.id, id));
  const updated = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await canAccessLead(id, user.id!);
  if (!access.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(leads).where(eq(leads.id, id));
  return NextResponse.json({ ok: true });
}
