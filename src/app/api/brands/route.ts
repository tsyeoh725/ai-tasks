import { db } from "@/db";
import { brands, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// Default BrandConfig (shape mirrors BrandConfig in claude-guard.ts; persisted as JSON text).
function defaultBrandConfig() {
  return {
    thresholds: { cplMax: null, ctrMin: null, frequencyMax: null },
    toggles: { killEnabled: false, budgetEnabled: false, duplicateEnabled: false },
    preferences: [],
    insightsDateRange: 7,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const result = await db.query.brands.findMany({
    where: eq(brands.userId, user.id),
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  return NextResponse.json({ brands: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { name, metaAccountId, config } = body ?? {};

  if (!name || !metaAccountId) {
    return NextResponse.json(
      { error: "name and metaAccountId are required" },
      { status: 400 },
    );
  }

  const now = new Date();
  const brandId = uuid();
  const projectId = uuid();

  // Create the linked project first so we can persist its id on the brand.
  await db.insert(projects).values({
    id: projectId,
    name: `${name} Ads`,
    description: null,
    color: "#6366f1",
    icon: "\u{1F3AF}", // "🎯"
    teamId: null,
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const configJson = JSON.stringify(config ?? defaultBrandConfig());

  await db.insert(brands).values({
    id: brandId,
    userId: user.id,
    projectId,
    name,
    metaAccountId,
    config: configJson,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  return NextResponse.json(brand, { status: 201 });
}
