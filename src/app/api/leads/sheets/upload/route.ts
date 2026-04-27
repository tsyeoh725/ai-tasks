import { db } from "@/db";
import { leads } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const mappingRaw = formData.get("mapping") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const mapping: Record<string, string> = mappingRaw ? JSON.parse(mappingRaw) : {};

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows: string[][];
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    rows = json.map((r) => r.map(String));
  } catch {
    return NextResponse.json({ error: "Could not read file. Upload a valid .xlsx or .csv file." }, { status: 400 });
  }

  if (rows.length < 2) return NextResponse.json({ imported: 0, skipped: 0, total: 0 });

  const headerRow = rows[0];
  const dataRows = rows.slice(1);

  const fieldToCol: Record<string, number> = {};
  for (const [colName, field] of Object.entries(mapping)) {
    if (!field) continue;
    const idx = headerRow.findIndex((h) => h.trim() === colName);
    if (idx >= 0) fieldToCol[field] = idx;
  }

  // If no explicit mapping provided, auto-detect by header name
  if (Object.keys(fieldToCol).length === 0) {
    const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z]/g, "");
    const autoMap: Record<string, string[]> = {
      name: ["name", "fullname", "contactname", "leadname"],
      email: ["email", "emailaddress", "mail"],
      phone: ["phone", "phonenumber", "mobile", "tel", "contact"],
      company: ["company", "companyname", "organization", "business", "firm"],
      source: ["source", "leadsource"],
      status: ["status", "leadstatus", "stage"],
      notes: ["notes", "note", "comments", "remark", "remarks"],
    };
    headerRow.forEach((h, i) => {
      const n = norm(h);
      for (const [field, aliases] of Object.entries(autoMap)) {
        if (aliases.includes(n)) { fieldToCol[field] = i; break; }
      }
    });
  }

  const now = new Date();
  let imported = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const get = (f: string) => (fieldToCol[f] !== undefined ? (row[fieldToCol[f]] || "").trim() : "");

    const name = get("name");
    if (!name) { skipped++; continue; }

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
