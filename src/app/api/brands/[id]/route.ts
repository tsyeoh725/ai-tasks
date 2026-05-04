import { db } from "@/db";
import { brands, projects, teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { serializeBrand } from "../route";
import { canAccessBrand } from "@/lib/brand-access";

async function loadAccessible(id: string, userId: string) {
  const brand = await db.query.brands.findFirst({ where: eq(brands.id, id) });
  if (!brand) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!(await canAccessBrand(brand, userId))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { brand };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { brand, error } = await loadAccessible(id, user.id);
  if (error) return error;

  return NextResponse.json(brand ? serializeBrand(brand) : null);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { brand, error } = await loadAccessible(id, user.id);
  if (error) return error;

  const body = (await req.json()) as Record<string, unknown>;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updateData.name = body.name;
  if (typeof body.metaAccountId === "string") updateData.metaAccountId = body.metaAccountId;
  if (typeof body.isActive === "boolean") updateData.isActive = body.isActive;
  if (body.config !== undefined) {
    updateData.config = typeof body.config === "string" ? body.config : JSON.stringify(body.config);
  }
  if (body.projectId === null || typeof body.projectId === "string") {
    updateData.projectId = body.projectId;
  }

  // Workspace move: brand.teamId of `null` = personal, a team uuid = team workspace.
  // The linked project moves with the brand so its tasks land in the same scope.
  let projectMovedTo: string | null | undefined = undefined;
  if (body.teamId === null || typeof body.teamId === "string") {
    const targetTeamId = body.teamId as string | null;
    if (targetTeamId) {
      const membership = await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.teamId, targetTeamId), eq(teamMembers.userId, user.id)),
      });
      if (!membership) {
        return NextResponse.json({ error: "Not a member of target team" }, { status: 403 });
      }
    }
    updateData.teamId = targetTeamId;
    if (brand?.projectId) projectMovedTo = targetTeamId;
  }

  await db.update(brands).set(updateData).where(eq(brands.id, id));
  if (projectMovedTo !== undefined && brand?.projectId) {
    await db.update(projects).set({ teamId: projectMovedTo, updatedAt: new Date() }).where(eq(projects.id, brand.projectId));
  }

  const updated = await db.query.brands.findFirst({ where: eq(brands.id, id) });
  return NextResponse.json(updated ? serializeBrand(updated) : null);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const { error } = await loadAccessible(id, user.id);
  if (error) return error;

  // Cascade deletes are defined on the schema (campaigns, adSets, ads, journal, memory).
  await db.delete(brands).where(eq(brands.id, id));
  return NextResponse.json({ success: true });
}
