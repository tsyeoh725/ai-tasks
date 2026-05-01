// Per-user marketing settings stored in the globalSettings key/value table.
// Values are JSON-encoded. Known keys:
//   - meta_access_token (string)
//   - monitor_interval_hours (number)
//   - weekly_report_day (string: "mon" | "tue" | ... | "sun")
//   - weekly_report_hour (number, 0-23)
//   - global_pause (boolean)
import { db } from "@/db";
import { globalSettings, brands } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

const KNOWN_KEYS = [
  "meta_access_token",
  "monitor_interval_hours",
  "weekly_report_day",
  "weekly_report_hour",
  "global_pause",
] as const;

type KnownKey = (typeof KNOWN_KEYS)[number];

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rows = await db.query.globalSettings.findMany({
    where: eq(globalSettings.userId, user.id),
  });

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = parseValue(row.value);
  }

  // Mask the access token — never return it in full.
  if (typeof settings.meta_access_token === "string" && settings.meta_access_token.length > 0) {
    const token = settings.meta_access_token;
    settings.meta_access_token_masked = `${token.slice(0, 4)}…${token.slice(-4)}`;
    settings.meta_access_token = undefined;
  }

  // Connected brands (ad accounts) — lightweight list.
  const connectedBrands = await db.query.brands.findMany({
    where: eq(brands.userId, user.id),
    columns: { id: true, name: true, metaAccountId: true, isActive: true },
  });

  return NextResponse.json({ settings, brands: connectedBrands });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const [key, rawValue] of Object.entries(body)) {
    if (!KNOWN_KEYS.includes(key as KnownKey)) continue;
    if (rawValue === undefined || rawValue === null) continue;

    const value = JSON.stringify(rawValue);

    const existing = await db.query.globalSettings.findFirst({
      where: and(eq(globalSettings.userId, user.id), eq(globalSettings.key, key)),
    });

    if (existing) {
      await db
        .update(globalSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(globalSettings.id, existing.id));
    } else {
      await db.insert(globalSettings).values({
        id: uuid(),
        userId: user.id,
        key,
        value,
      });
    }
  }

  return NextResponse.json({ success: true });
}
