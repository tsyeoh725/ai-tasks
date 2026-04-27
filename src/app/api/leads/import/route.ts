import { db } from "@/db";
import { leads } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// Forgiving CSV parser
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
    name: find("name", "fullname", "leadname", "contactname"),
    email: find("email", "emailaddress"),
    phone: find("phone", "phonenumber", "mobile", "tel"),
    company: find("company", "companyname", "organization", "org"),
    website: find("website", "url", "site"),
    jobTitle: find("jobtitle", "title", "position", "role"),
    source: find("source", "leadsource"),
    notes: find("notes", "comments", "description"),
    estimatedValue: find("estimatedvalue", "value", "amount", "deal", "dealsize"),
  };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const ct = req.headers.get("content-type") || "";
  let csvText = "";
  if (ct.includes("multipart/form-data")) {
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
  if (rows.length < 2) return NextResponse.json({ error: "CSV needs at least one data row" }, { status: 400 });

  const headers = rows[0];
  const col = pickColumns(headers);
  if (col.name === -1 && col.email === -1) {
    return NextResponse.json({
      error: "Cannot detect Name or Email column",
      hint: "Expected columns: Name, Email, Company, Phone, Website, Job Title, Source, Notes, Estimated Value",
    }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const now = new Date();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = (col.name >= 0 ? row[col.name] : "")?.trim() || (col.email >= 0 ? row[col.email] : "")?.trim();
    if (!name) { skipped++; continue; }
    const id = uuid();
    await db.insert(leads).values({
      id,
      ownerId: user.id!,
      name,
      email: col.email >= 0 ? row[col.email]?.trim() || null : null,
      phone: col.phone >= 0 ? row[col.phone]?.trim() || null : null,
      company: col.company >= 0 ? row[col.company]?.trim() || null : null,
      website: col.website >= 0 ? row[col.website]?.trim() || null : null,
      jobTitle: col.jobTitle >= 0 ? row[col.jobTitle]?.trim() || null : null,
      source: "import",
      sourceDetail: col.source >= 0 ? row[col.source]?.trim() || null : null,
      status: "new",
      estimatedValue: col.estimatedValue >= 0 ? parseFloat((row[col.estimatedValue] || "").replace(/[^0-9.\-]/g, "")) || null : null,
      currency: "USD",
      services: "[]",
      notes: col.notes >= 0 ? row[col.notes]?.trim() || null : null,
      tags: "[]",
      customFields: "{}",
      createdAt: now,
      updatedAt: now,
    });
    imported++;
  }

  return NextResponse.json({ imported, skipped, total: rows.length - 1 });
}
