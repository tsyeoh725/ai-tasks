import { db } from "@/db";
import { automationRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const rules = await db.query.automationRules.findMany({
    where: eq(automationRules.projectId, projectId),
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  });

  const parsed = rules.map((rule) => ({
    ...rule,
    trigger: JSON.parse(rule.trigger),
    actions: JSON.parse(rule.actions),
  }));

  return NextResponse.json({ rules: parsed });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { projectId, name, description, trigger, actions, enabled } = body;

  if (!projectId || !name || !trigger || !actions) {
    return NextResponse.json(
      { error: "projectId, name, trigger, and actions are required" },
      { status: 400 }
    );
  }

  const rule = {
    id: uuid(),
    projectId,
    name,
    description: description || null,
    trigger: JSON.stringify(trigger),
    actions: JSON.stringify(actions),
    enabled: enabled !== undefined ? enabled : true,
    createdById: user.id!,
  };

  await db.insert(automationRules).values(rule);

  return NextResponse.json({
    ...rule,
    trigger,
    actions,
  });
}
