import { db } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { Workspace } from "@/lib/workspace";

/**
 * Build the `WHERE` clause for "projects this user can see, optionally scoped
 * to a workspace".
 *   - workspace=undefined → personal + every team they're in (legacy default)
 *   - workspace=personal  → only personal (ownerId=user AND teamId IS NULL)
 *   - workspace=team:x    → only team x (after verifying membership)
 */
async function projectsWhere(userId: string, workspace?: Workspace): Promise<SQL | undefined> {
  if (workspace?.kind === "personal") {
    return and(eq(projects.ownerId, userId), isNull(projects.teamId));
  }
  if (workspace?.kind === "team") {
    const member = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, workspace.teamId), eq(teamMembers.userId, userId)),
    });
    if (!member) return eq(projects.id, "__no_access__"); // matches nothing
    return eq(projects.teamId, workspace.teamId);
  }
  // No workspace specified → legacy "everything I can see".
  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);
  const conds = [and(eq(projects.ownerId, userId), isNull(projects.teamId))];
  if (teamIds.length > 0) conds.push(inArray(projects.teamId, teamIds));
  return or(...conds);
}

export async function getAccessibleProjectIds(
  userId: string,
  workspace?: Workspace,
): Promise<string[]> {
  const where = await projectsWhere(userId, workspace);
  const rows = await db.query.projects.findMany({ where, columns: { id: true } });
  return rows.map((p) => p.id);
}

export async function getAccessibleProjects(userId: string, workspace?: Workspace) {
  const where = await projectsWhere(userId, workspace);
  return db.query.projects.findMany({ where });
}
