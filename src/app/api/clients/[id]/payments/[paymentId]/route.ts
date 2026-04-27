import { db } from "@/db";
import { clientPayments, clientInvoices } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, paymentId } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  if (body.invoiceId !== undefined) {
    updates.invoiceId = body.invoiceId;
    updates.matched = !!body.invoiceId;
  }
  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    updates.amount = amt;
  }
  if (body.paymentDate !== undefined) updates.paymentDate = new Date(body.paymentDate as string);
  if (body.reference !== undefined) updates.reference = body.reference;
  if (body.notes !== undefined) updates.notes = body.notes;

  await db.update(clientPayments)
    .set(updates)
    .where(and(eq(clientPayments.id, paymentId), eq(clientPayments.clientId, id)));

  // If linking to invoice and amount matches, mark paid
  if (body.invoiceId && updates.amount !== undefined) {
    const inv = await db.query.clientInvoices.findFirst({ where: eq(clientInvoices.id, body.invoiceId as string) });
    if (inv && Math.abs(inv.amount - (updates.amount as number)) < 0.01) {
      await db.update(clientInvoices)
        .set({ status: "paid", paidDate: new Date(), updatedAt: new Date() })
        .where(eq(clientInvoices.id, inv.id));
    }
  }

  const updated = await db.query.clientPayments.findFirst({ where: eq(clientPayments.id, paymentId) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, paymentId } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(clientPayments)
    .where(and(eq(clientPayments.id, paymentId), eq(clientPayments.clientId, id)));
  return NextResponse.json({ success: true });
}
