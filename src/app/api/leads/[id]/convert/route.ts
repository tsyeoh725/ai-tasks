import { db } from "@/db";
import { leads, clients, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// POST — convert a lead into a client record
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Check access
  if (lead.ownerId !== user.id) {
    if (lead.teamId) {
      const m = await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.teamId, lead.teamId), eq(teamMembers.userId, user.id!)),
      });
      if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (lead.convertedClientId) {
    return NextResponse.json({ ok: true, alreadyConverted: true, clientId: lead.convertedClientId });
  }

  const clientId = uuid();
  const now = new Date();
  await db.insert(clients).values({
    id: clientId,
    ownerId: user.id!,
    teamId: lead.teamId,
    name: lead.company || lead.name,
    contactName: lead.name,
    contactEmail: lead.email,
    contactPhone: lead.phone,
    website: lead.website,
    services: lead.services,
    notes: lead.notes,
    status: "onboarding",
    currency: lead.currency || "USD",
    customFields: "{}",
    brandColor: "#99ff33",
    createdAt: now,
    updatedAt: now,
  });

  await db.update(leads).set({
    status: "won",
    convertedClientId: clientId,
    convertedAt: now,
    updatedAt: now,
  }).where(eq(leads.id, id));

  return NextResponse.json({ ok: true, clientId });
}
