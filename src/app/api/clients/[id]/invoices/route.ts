import { db } from "@/db";
import { clientInvoices, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

const ALLOWED_STATUS = ["draft", "sent", "paid", "overdue", "void"] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invoices = await db.query.clientInvoices.findMany({
    where: eq(clientInvoices.clientId, id),
    orderBy: (i, { desc }) => [desc(i.issuedDate), desc(i.createdAt)],
    with: { payments: { columns: { id: true, amount: true, paymentDate: true } } },
  });

  return NextResponse.json({ invoices });
}

async function autoInvoiceNumber(clientId: string) {
  const count = await db.query.clientInvoices.findMany({
    where: eq(clientInvoices.clientId, clientId),
    columns: { id: true },
  });
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count.length + 1).padStart(4, "0")}`;
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

  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  const currency = (body.currency as string) || client?.currency || "USD";

  const invoiceId = uuid();
  const now = new Date();
  const number = (body.number as string) || (await autoInvoiceNumber(id));
  const status = ALLOWED_STATUS.includes(body.status as never) ? (body.status as typeof ALLOWED_STATUS[number]) : "draft";

  await db.insert(clientInvoices).values({
    id: invoiceId,
    clientId: id,
    number,
    title: (body.title as string) || null,
    amount,
    currency,
    status,
    issuedDate: body.issuedDate ? new Date(body.issuedDate as string) : now,
    dueDate: body.dueDate ? new Date(body.dueDate as string) : null,
    paidDate: status === "paid" ? (body.paidDate ? new Date(body.paidDate as string) : now) : null,
    items: typeof body.items === "object" ? JSON.stringify(body.items) : "[]",
    notes: (body.notes as string) || null,
    filePath: (body.filePath as string) || null,
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.clientInvoices.findFirst({ where: eq(clientInvoices.id, invoiceId) });
  return NextResponse.json(created, { status: 201 });
}
