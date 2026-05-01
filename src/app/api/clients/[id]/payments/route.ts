import { db } from "@/db";
import { clientPayments, clientInvoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payments = await db.query.clientPayments.findMany({
    where: eq(clientPayments.clientId, id),
    orderBy: (p, { desc }) => [desc(p.paymentDate)],
    with: { invoice: { columns: { id: true, number: true, amount: true } } },
  });

  return NextResponse.json({ payments });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  }

  const paymentId = uuid();
  const now = new Date();
  await db.insert(clientPayments).values({
    id: paymentId,
    clientId: id,
    invoiceId: (body.invoiceId as string) || null,
    amount,
    currency: (body.currency as string) || "USD",
    paymentDate: body.paymentDate ? new Date(body.paymentDate as string) : now,
    reference: (body.reference as string) || null,
    source: (body.source as "bank_import" | "manual" | "stripe" | "other") || "manual",
    rawDescription: (body.rawDescription as string) || null,
    matched: !!body.invoiceId,
    notes: (body.notes as string) || null,
    createdAt: now,
  });

  // If linked to invoice, mark that invoice paid if amount matches
  if (body.invoiceId) {
    const inv = await db.query.clientInvoices.findFirst({ where: eq(clientInvoices.id, body.invoiceId as string) });
    if (inv && Math.abs(inv.amount - amount) < 0.01) {
      await db.update(clientInvoices)
        .set({ status: "paid", paidDate: now, updatedAt: now })
        .where(eq(clientInvoices.id, inv.id));
    }
  }

  const created = await db.query.clientPayments.findFirst({ where: eq(clientPayments.id, paymentId) });
  return NextResponse.json(created, { status: 201 });
}
