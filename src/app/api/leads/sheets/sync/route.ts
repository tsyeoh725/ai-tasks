import { db } from "@/db";
import { leads } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  for (const line of csv.split("\n")) {
    if (!line.trim()) continue;
    // Simple CSV parse — handles quoted fields
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const mapping = (body.mapping ?? {}) as Record<string, string>;

  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  const sheetId = extractSheetId(url);
  if (!sheetId) return NextResponse.json({ error: "Invalid URL" }, { status: 400 });

  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  let csv: string;
  try {
    const res = await fetch(csvUrl, { headers: { "User-Agent": "AI-Tasks/1.0" }, redirect: "follow" });
    if (!res.ok) return NextResponse.json({ error: `Sheet fetch failed (${res.status})` }, { status: res.status });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) return NextResponse.json({ error: "Sheet is not publicly accessible." }, { status: 403 });
    csv = await res.text();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const rows = parseCSV(csv);
  if (rows.length < 2) return NextResponse.json({ imported: 0, skipped: 0, total: 0 });

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  // Build column index map: crmField -> columnIndex
  const fieldToCol: Record<string, number> = {};
  for (const [colName, field] of Object.entries(mapping)) {
    if (!field) continue;
    const idx = headerRow.findIndex((h) => h.trim() === colName);
    if (idx >= 0) fieldToCol[field] = idx;
  }

  const now = new Date();
  let imported = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const get = (f: string) => (fieldToCol[f] !== undefined ? (row[fieldToCol[f]] || "").trim() : "");

    const name = get("name");
    if (!name) { skipped++; continue; }

    // Check for duplicate by email
    const email = get("email") || null;
    if (email) {
      const existing = await db.query.leads.findFirst({
        where: and(eq(leads.ownerId, user.id!), eq(leads.email, email)),
        columns: { id: true },
      });
      if (existing) { skipped++; continue; }
    }

    const statusVal = get("status");
    const validStatuses = ["new","contacted","qualified","proposal","negotiation","won","lost","nurture"];
    const status = validStatuses.includes(statusVal) ? statusVal as "new"|"contacted"|"qualified"|"proposal"|"negotiation"|"won"|"lost"|"nurture" : "new";

    const sourceVal = get("source");
    const validSources = ["inbound","outbound","referral","social","website","event","import","manual"];
    const source = validSources.includes(sourceVal) ? sourceVal as "inbound"|"outbound"|"referral"|"social"|"website"|"event"|"import"|"manual" : "import";

    await db.insert(leads).values({
      id: uuid(),
      ownerId: user.id!,
      name,
      email,
      phone: get("phone") || null,
      company: get("company") || null,
      source,
      status,
      notes: get("notes") || null,
      services: "[]",
      tags: "[]",
      createdAt: now,
      updatedAt: now,
    });
    imported++;
  }

  return NextResponse.json({ imported, skipped, total: dataRows.length });
}
