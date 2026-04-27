import { db } from "@/db";
import { clientInvoices } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";

const ALLOWED_STATUS = ["draft", "sent", "paid", "overdue", "void"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, invoiceId } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.number !== undefined) updates.number = body.number;
  if (body.title !== undefined) updates.title = body.title;
  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    updates.amount = amt;
  }
  if (body.currency !== undefined) updates.currency = body.currency;
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status as never)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    updates.status = body.status;
    if (body.status === "paid" && !body.paidDate) updates.paidDate = new Date();
  }
  if (body.issuedDate !== undefined) updates.issuedDate = body.issuedDate ? new Date(body.issuedDate as string) : null;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate ? new Date(body.dueDate as string) : null;
  if (body.paidDate !== undefined) updates.paidDate = body.paidDate ? new Date(body.paidDate as string) : null;
  if (body.items !== undefined) updates.items = typeof body.items === "string" ? body.items : JSON.stringify(body.items);
  if (body.notes !== undefined) updates.notes = body.notes;

  await db.update(clientInvoices)
    .set(updates)
    .where(and(eq(clientInvoices.id, invoiceId), eq(clientInvoices.clientId, id)));

  const updated = await db.query.clientInvoices.findFirst({ where: eq(clientInvoices.id, invoiceId) });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, invoiceId } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(clientInvoices)
    .where(and(eq(clientInvoices.id, invoiceId), eq(clientInvoices.clientId, id)));
  return NextResponse.json({ success: true });
}
