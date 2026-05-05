import { db } from "@/db";
import { globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  DEFAULT_GUARD_SYSTEM_PROMPT,
  GUARD_PROMPT_VARIABLES,
} from "@/lib/marketing/claude-guard";

const KEY = "guard_system_prompt";

// GET /api/automation/system-prompt
//   Returns the operator's saved guard prompt template, the default for
//   reference, and the supported {{...}} variables.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const row = await db.query.globalSettings.findFirst({
    where: and(eq(globalSettings.userId, user.id), eq(globalSettings.key, KEY)),
  });

  let template = "";
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { template?: string } | string;
      template = typeof parsed === "string" ? parsed : (parsed?.template ?? "");
    } catch {}
  }

  return NextResponse.json({
    template,
    defaultTemplate: DEFAULT_GUARD_SYSTEM_PROMPT,
    variables: GUARD_PROMPT_VARIABLES,
    isDefault: !template || template.trim().length === 0,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  });
}

// POST /api/automation/system-prompt  { template: string }
//   Empty / missing template = revert to default (delete the row).
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { template?: string };
  const template = (body.template ?? "").trim();

  if (template.length === 0) {
    await db
      .delete(globalSettings)
      .where(and(eq(globalSettings.userId, user.id), eq(globalSettings.key, KEY)));
    return NextResponse.json({ success: true, isDefault: true });
  }

  if (template.length > 20_000) {
    return NextResponse.json({ error: "Prompt too long (max 20,000 chars)" }, { status: 400 });
  }

  const existing = await db.query.globalSettings.findFirst({
    where: and(eq(globalSettings.userId, user.id), eq(globalSettings.key, KEY)),
  });

  const value = JSON.stringify({ template });
  if (existing) {
    await db
      .update(globalSettings)
      .set({ value, updatedAt: new Date() })
      .where(and(eq(globalSettings.userId, user.id), eq(globalSettings.key, KEY)));
  } else {
    await db.insert(globalSettings).values({
      id: uuid(),
      userId: user.id,
      key: KEY,
      value,
      updatedAt: new Date(),
    });
  }

  return NextResponse.json({ success: true, isDefault: false });
}
