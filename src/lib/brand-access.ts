// Workspace-aware filter for brand-scoped queries.
//
// In personal workspace, a user sees brands they own that aren't attached to a
// team. In team workspace, they see all brands attached to that team — created
// by anyone on the team. Mirrors the same model used for projects.
import { db } from "@/db";
import { brands, teamMembers } from "@/db/schema";
import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { Workspace } from "./workspace";

type BrandRow = typeof brands.$inferSelect;

export function brandsAccessibleWhere(workspace: Workspace, userId: string): SQL {
  if (workspace.kind === "personal") {
    return and(eq(brands.userId, userId), isNull(brands.teamId))!;
  }
  return eq(brands.teamId, workspace.teamId);
}

/**
 * True when the user can read/write this brand. A team brand is accessible to
 * any team member; a personal brand only to its owner.
 *
 * This is a per-row check rather than a query filter, so it works for routes
 * that already have a brand id (e.g. `/api/brands/[id]`).
 */
export async function canAccessBrand(brand: BrandRow, userId: string): Promise<boolean> {
  if (brand.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, brand.teamId), eq(teamMembers.userId, userId)),
    });
    return !!membership;
  }
  return brand.userId === userId;
}
