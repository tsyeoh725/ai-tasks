import { db } from "@/db";
import { projects, teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Returns true if userId may read/write the given project.
 * Access is granted when the user is the project owner, or a member of the project's team.
 */
export async function canAccessProject(projectId: string, userId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    columns: { ownerId: true, teamId: true },
  });

  if (!project) return false;
  if (project.ownerId === userId) return true;

  if (project.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, userId)),
      columns: { id: true },
    });
    return !!membership;
  }

  return false;
}
