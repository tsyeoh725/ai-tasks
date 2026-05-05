import { db } from "@/db";
import { globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  PROMPT_KINDS,
  loadAllPromptSections,
  getPromptDefault,
  getPromptKey,
  type PromptKind,
} from "@/lib/marketing/claude-guard";

const KIND_META: Record<
  PromptKind,
  { label: string; description: string }
> = {
  audit: {
    label: "Audit",
    description: "Tells the AI Guard how to validate / approve / reject each recommendation.",
  },
  confidence: {
    label: "Confidence",
    description: "How the AI assigns the confidence number (0–1) it returns alongside the verdict.",
  },
  health: {
    label: "Ads health",
    description: "Risk classification rules that decide HIGH/MEDIUM/LOW risk for each action.",
  },
};

// GET /api/automation/prompts
//   Returns the current value for each editable prompt section, plus its
//   default text so the UI can offer "load default" without round-tripping.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const sections = await loadAllPromptSections(user.id);
  const result = PROMPT_KINDS.map((kind) => ({
    kind,
    label: KIND_META[kind].label,
    description: KIND_META[kind].description,
    template: sections[kind],
    defaultTemplate: getPromptDefault(kind),
    isDefault: sections[kind].trim() === getPromptDefault(kind).trim(),
  }));

  return NextResponse.json({ prompts: result });
}

// POST /api/automation/prompts  { kind, template }
//   Empty template = revert to default (delete the row).
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { kind?: string; template?: string };
  if (!body.kind || !PROMPT_KINDS.includes(body.kind as PromptKind)) {
    return NextResponse.json(
      { error: `kind must be one of ${PROMPT_KINDS.join(", ")}` },
      { status: 400 },
    );
  }
  const kind = body.kind as PromptKind;
  const template = (body.template ?? "").trim();
  const key = getPromptKey(kind);

  if (template.length === 0) {
    await db
      .delete(globalSettings)
      .where(and(eq(globalSettings.userId, user.id), eq(globalSettings.key, key)));
    return NextResponse.json({ success: true, isDefault: true });
  }
  if (template.length > 20_000) {
    return NextResponse.json({ error: "Prompt too long (max 20,000 chars)" }, { status: 400 });
  }

  const existing = await db.query.globalSettings.findFirst({
    where: and(eq(globalSettings.userId, user.id), eq(globalSettings.key, key)),
  });

  const value = JSON.stringify({ template });
  if (existing) {
    await db
      .update(globalSettings)
      .set({ value, updatedAt: new Date() })
      .where(and(eq(globalSettings.userId, user.id), eq(globalSettings.key, key)));
  } else {
    await db.insert(globalSettings).values({
      id: uuid(),
      userId: user.id,
      key,
      value,
      updatedAt: new Date(),
    });
  }

  return NextResponse.json({ success: true, isDefault: false });
}
