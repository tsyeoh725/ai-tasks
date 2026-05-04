import { db } from "@/db";
import { brands, projects, teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";

// Default BrandConfig (shape mirrors BrandConfig in claude-guard.ts; persisted as JSON text).
function defaultBrandConfig() {
  return {
    thresholds: { cplMax: null, ctrMin: null, frequencyMax: null },
    toggles: { killEnabled: false, budgetEnabled: false, duplicateEnabled: false },
    preferences: [],
    insightsDateRange: 7,
  };
}

// `config` is stored as JSON text in SQLite. Parse before returning so the
// client can read brand.config.thresholds.cplMax directly.
type BrandRow = typeof brands.$inferSelect;
export function serializeBrand(brand: BrandRow) {
  let parsedConfig: unknown = defaultBrandConfig();
  try {
    parsedConfig = brand.config ? JSON.parse(brand.config) : defaultBrandConfig();
  } catch {
    // Corrupt JSON in DB — fall back to defaults rather than crashing the API.
    parsedConfig = defaultBrandConfig();
  }
  return { ...brand, config: parsedConfig };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const ws = await resolveWorkspaceForUser(user.id);
  const result = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  return NextResponse.json({ brands: result.map(serializeBrand) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const { name, metaAccountId, config, teamId: bodyTeamId } = body ?? {};

  if (!name || !metaAccountId) {
    return NextResponse.json(
      { error: "name and metaAccountId are required" },
      { status: 400 },
    );
  }

  // teamId from body wins; otherwise default to whatever workspace the user is in.
  const ws = await resolveWorkspaceForUser(user.id);
  const resolvedTeamId: string | null =
    (typeof bodyTeamId === "string" ? bodyTeamId : null)
    ?? (ws.kind === "team" ? ws.teamId : null);

  if (resolvedTeamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, resolvedTeamId), eq(teamMembers.userId, user.id)),
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a team member" }, { status: 403 });
    }
  }

  const now = new Date();
  const brandId = uuid();
  const projectId = uuid();

  // Create the linked project first so we can persist its id on the brand.
  // Project shares the brand's team scope so the auto-created tasks land in
  // the same workspace.
  await db.insert(projects).values({
    id: projectId,
    name: `${name} Ads`,
    description: null,
    color: "#6366f1",
    icon: "\u{1F3AF}", // "🎯"
    teamId: resolvedTeamId,
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const configJson = JSON.stringify(config ?? defaultBrandConfig());

  await db.insert(brands).values({
    id: brandId,
    userId: user.id,
    teamId: resolvedTeamId,
    projectId,
    name,
    metaAccountId,
    config: configJson,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  return NextResponse.json(brand ? serializeBrand(brand) : null, { status: 201 });
}
