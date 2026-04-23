import { db } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

export async function getAccessibleProjectIds(userId: string): Promise<string[]> {
  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const conds = [and(eq(projects.ownerId, userId), isNull(projects.teamId))];
  if (teamIds.length > 0) {
    conds.push(inArray(projects.teamId, teamIds));
  }

  const rows = await db.query.projects.findMany({
    where: or(...conds),
    columns: { id: true },
  });
  return rows.map((p) => p.id);
}

export async function getAccessibleProjects(userId: string) {
  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true },
  });
  const teamIds = memberships.map((m) => m.teamId);

  const conds = [and(eq(projects.ownerId, userId), isNull(projects.teamId))];
  if (teamIds.length > 0) {
    conds.push(inArray(projects.teamId, teamIds));
  }

  return db.query.projects.findMany({ where: or(...conds) });
}
