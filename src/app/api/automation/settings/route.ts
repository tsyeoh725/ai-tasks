import { db } from "@/db";
import { automationSettings, brands } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere, canAccessBrand } from "@/lib/brand-access";
import { v4 as uuid } from "uuid";

const ALLOWED_ACTIONS = new Set(["pause", "kill", "boost_budget", "duplicate"]);

// GET /api/automation/settings
//   Returns per-brand automation rows for every brand the user can access.
//   Brands without a row come back with sensible defaults so the UI can
//   render every brand without an extra "create" round-trip.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const ws = await resolveWorkspaceForUser(user.id);
  const accessibleBrands = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true, name: true, isActive: true, userId: true },
  });
  if (accessibleBrands.length === 0) {
    return NextResponse.json({ brands: [] });
  }

  const brandIds = accessibleBrands.map((b) => b.id);
  const rows = await db.query.automationSettings.findMany({
    where: inArray(automationSettings.brandId, brandIds),
  });
  const byBrand = new Map(rows.map((r) => [r.brandId, r]));

  return NextResponse.json({
    brands: accessibleBrands.map((b) => {
      const row = byBrand.get(b.id);
      let actions: string[] = ["pause", "kill"];
      if (row) {
        try {
          actions = JSON.parse(row.autoApproveActions) as string[];
        } catch {}
      }
      return {
        brandId: b.id,
        brandName: b.name,
        isActive: b.isActive,
        enabled: row?.enabled ?? false,
        cadenceHours: row?.cadenceHours ?? 6,
        autoApproveMinConfidence: row?.autoApproveMinConfidence ?? 0.85,
        autoApproveActions: actions,
        lastCycleAt: row?.lastCycleAt?.toISOString() ?? null,
      };
    }),
  });
}

// POST /api/automation/settings
//   { brandId, enabled?, cadenceHours?, autoApproveMinConfidence?, autoApproveActions? }
//   Upserts the row for this brand. Only the fields you send get touched.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as {
    brandId?: string;
    enabled?: boolean;
    cadenceHours?: number;
    autoApproveMinConfidence?: number;
    autoApproveActions?: string[];
  };
  if (!body.brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, body.brandId) });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!(await canAccessBrand(brand, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate inputs before touching the DB so a bad payload never half-commits.
  if (body.cadenceHours !== undefined) {
    if (!Number.isFinite(body.cadenceHours) || body.cadenceHours < 1 || body.cadenceHours > 168) {
      return NextResponse.json({ error: "cadenceHours must be between 1 and 168" }, { status: 400 });
    }
  }
  if (body.autoApproveMinConfidence !== undefined) {
    if (!Number.isFinite(body.autoApproveMinConfidence) || body.autoApproveMinConfidence < 0 || body.autoApproveMinConfidence > 1) {
      return NextResponse.json({ error: "autoApproveMinConfidence must be between 0 and 1" }, { status: 400 });
    }
  }
  let actionsJson: string | undefined;
  if (body.autoApproveActions !== undefined) {
    if (!Array.isArray(body.autoApproveActions) || !body.autoApproveActions.every((a) => ALLOWED_ACTIONS.has(a))) {
      return NextResponse.json({ error: "autoApproveActions must be a subset of pause/kill/boost_budget/duplicate" }, { status: 400 });
    }
    actionsJson = JSON.stringify(body.autoApproveActions);
  }

  const existing = await db.query.automationSettings.findFirst({
    where: eq(automationSettings.brandId, body.brandId),
  });

  if (!existing) {
    await db.insert(automationSettings).values({
      id: uuid(),
      brandId: body.brandId,
      enabled: body.enabled ?? false,
      cadenceHours: body.cadenceHours ?? 6,
      autoApproveMinConfidence: body.autoApproveMinConfidence ?? 0.85,
      autoApproveActions: actionsJson ?? "[\"pause\",\"kill\"]",
      updatedAt: new Date(),
    });
  } else {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.cadenceHours !== undefined) patch.cadenceHours = body.cadenceHours;
    if (body.autoApproveMinConfidence !== undefined) patch.autoApproveMinConfidence = body.autoApproveMinConfidence;
    if (actionsJson !== undefined) patch.autoApproveActions = actionsJson;
    await db
      .update(automationSettings)
      .set(patch)
      .where(and(eq(automationSettings.brandId, body.brandId)));
  }

  return NextResponse.json({ success: true });
}
