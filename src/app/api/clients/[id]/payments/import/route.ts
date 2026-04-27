import { db } from "@/db";
import { clientPayments, clientInvoices } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

type ParsedRow = {
  date: Date;
  amount: number;
  description: string;
  reference?: string;
};

// ─── Very forgiving CSV parser ────────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cur.push(cell); cell = ""; }
      else if (ch === "\n") { cur.push(cell); rows.push(cur); cur = []; cell = ""; }
      else if (ch === "\r") continue;
      else cell += ch;
    }
  }
  if (cell || cur.length > 0) { cur.push(cell); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Identify columns by common header names
function pickColumns(headers: string[]) {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z]/g, "");
  const find = (...names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex((h) => norm(h) === n);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    date: find("date", "transactiondate", "posteddate", "postingdate"),
    amount: find("amount", "credit", "deposit", "money", "value"),
    debit: find("debit", "withdrawal"),
    credit: find("credit", "deposit"),
    description: find("description", "narrative", "details", "memo", "reference", "particulars"),
    reference: find("reference", "ref", "refno", "transactionid"),
  };
}

function parseRows(rows: string[][]): ParsedRow[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const col = pickColumns(headers);

  const parsed: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = col.date >= 0 ? row[col.date] : "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) continue;

    let amount = 0;
    if (col.amount >= 0) amount = parseFloat(row[col.amount].replace(/[^0-9.\-]/g, "")) || 0;
    else if (col.credit >= 0) amount = parseFloat(row[col.credit].replace(/[^0-9.\-]/g, "")) || 0;

    if (amount <= 0) continue; // only record incoming payments

    parsed.push({
      date: d,
      amount,
      description: col.description >= 0 ? row[col.description] : "",
      reference: col.reference >= 0 ? row[col.reference] : undefined,
    });
  }
  return parsed;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") || "";
  let csvText = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    csvText = await file.text();
  } else {
    try { const body = await req.json(); csvText = (body.csv as string) || ""; }
    catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  }

  if (!csvText.trim()) return NextResponse.json({ error: "Empty CSV" }, { status: 400 });

  const rows = parseCSV(csvText);
  const parsed = parseRows(rows);
  if (parsed.length === 0) {
    return NextResponse.json({
      error: "No valid payments detected",
      hint: "Expected columns: Date, Amount (or Credit/Deposit), Description",
    }, { status: 400 });
  }

  // Load this client's invoices for matching
  const invoices = await db.query.clientInvoices.findMany({
    where: and(eq(clientInvoices.clientId, id)),
    columns: { id: true, number: true, amount: true, status: true },
  });
  // Map invoice number (lowercased) to invoice for quick reference-based lookup
  const invByNumber = new Map(invoices.map((i) => [i.number.toLowerCase().trim(), i]));

  let imported = 0;
  let matched = 0;
  const now = new Date();
  const newPayments: Array<{ id: string; amount: number; matched: boolean }> = [];

  for (const row of parsed) {
    const paymentId = uuid();
    let matchedInvoiceId: string | null = null;

    // Match heuristic 1: description or reference contains invoice number
    const searchText = `${row.description} ${row.reference ?? ""}`.toLowerCase();
    for (const inv of invoices) {
      if (inv.status === "paid") continue;
      if (searchText.includes(inv.number.toLowerCase())) {
        matchedInvoiceId = inv.id;
        break;
      }
    }

    // Match heuristic 2: exact amount match on a single unpaid invoice
    if (!matchedInvoiceId) {
      const candidates = invoices.filter(
        (inv) => inv.status !== "paid" && Math.abs(inv.amount - row.amount) < 0.01
      );
      if (candidates.length === 1) matchedInvoiceId = candidates[0].id;
    }

    await db.insert(clientPayments).values({
      id: paymentId,
      clientId: id,
      invoiceId: matchedInvoiceId,
      amount: row.amount,
      currency: "USD",
      paymentDate: row.date,
      reference: row.reference || null,
      source: "bank_import",
      rawDescription: row.description,
      matched: !!matchedInvoiceId,
      createdAt: now,
    });

    if (matchedInvoiceId) {
      const inv = invoices.find((i) => i.id === matchedInvoiceId);
      if (inv && Math.abs(inv.amount - row.amount) < 0.01) {
        await db.update(clientInvoices)
          .set({ status: "paid", paidDate: row.date, updatedAt: now })
          .where(eq(clientInvoices.id, inv.id));
      }
      matched++;
    }
    imported++;
    newPayments.push({ id: paymentId, amount: row.amount, matched: !!matchedInvoiceId });
  }

  // Figure out missing payments: invoices still unpaid and past due
  const updatedInvoices = await db.query.clientInvoices.findMany({
    where: eq(clientInvoices.clientId, id),
    columns: { id: true, number: true, amount: true, status: true, dueDate: true },
  });
  const missing = updatedInvoices.filter(
    (i) => (i.status === "sent" || i.status === "overdue") && i.dueDate && new Date(i.dueDate).getTime() < Date.now()
  );

  return NextResponse.json({
    imported,
    matched,
    unmatched: imported - matched,
    missingPayments: missing.map((i) => ({ id: i.id, number: i.number, amount: i.amount, dueDate: i.dueDate })),
  });
}
