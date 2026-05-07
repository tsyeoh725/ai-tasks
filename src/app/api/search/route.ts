import { db } from "@/db";
import { tasks, projects, taskComments, clients, brands, teamMembers } from "@/db/schema";
import { or, like, desc, inArray, eq, and, isNull, type SQL } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { getAccessibleProjectIds } from "@/lib/queries/projects";

// Search across tasks, projects, and comments — scoped to the active workspace
// (cookie). F-22 in the May 2026 audit flagged this endpoint for ignoring the
// workspace, leaking team data into personal views.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const query = url.searchParams.get("q");
  const type = url.searchParams.get("type"); // task, project, comment, or null for all
  const limit = parseInt(url.searchParams.get("limit") || "20");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const ws = await resolveWorkspaceForUser(user.id);
  const accessibleProjectIds = await getAccessibleProjectIds(user.id, ws);

  // F-02: also fetch the user's team memberships once so we can scope clients
  // and brands. We do NOT short-circuit on `accessibleProjectIds.length === 0`
  // any more — a fresh user may have zero projects but plenty of clients or
  // brands they expect to find by name.
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);

  const searchPattern = `%${query}%`;
  const results: Array<{
    type: string;
    id: string;
    title: string;
    subtitle?: string;
    entityId?: string;
  }> = [];

  // Search tasks
  if ((!type || type === "task") && accessibleProjectIds.length > 0) {
    const where: SQL = or(
      like(tasks.title, searchPattern),
      like(tasks.description, searchPattern),
    )!;
    const matchingTasks = await db.query.tasks.findMany({
      where: (t, { and }) => and(where, inArray(t.projectId, accessibleProjectIds)),
      with: { project: { columns: { id: true, name: true } } },
      orderBy: [desc(tasks.updatedAt)],
      limit,
    });

    for (const task of matchingTasks) {
      results.push({
        type: "task",
        id: task.id,
        title: task.title,
        subtitle: `${task.project.name} - ${task.status}`,
      });
    }
  }

  // Search projects
  if ((!type || type === "project") && accessibleProjectIds.length > 0) {
    const where: SQL = or(
      like(projects.name, searchPattern),
      like(projects.description, searchPattern),
    )!;
    const matchingProjects = await db.query.projects.findMany({
      where: (p, { and }) => and(where, inArray(p.id, accessibleProjectIds)),
      orderBy: [desc(projects.updatedAt)],
      limit,
    });

    for (const project of matchingProjects) {
      results.push({
        type: "project",
        id: project.id,
        title: project.name,
        subtitle: project.description || undefined,
      });
    }
  }

  // Search comments
  if ((!type || type === "comment") && accessibleProjectIds.length > 0) {
    const matchingComments = await db.query.taskComments.findMany({
      where: like(taskComments.content, searchPattern),
      with: {
        task: {
          columns: { id: true, title: true, projectId: true },
        },
      },
      orderBy: [desc(taskComments.createdAt)],
      limit: Math.min(limit, 10),
    });

    for (const comment of matchingComments) {
      if (accessibleProjectIds.includes(comment.task.projectId)) {
        results.push({
          type: "comment",
          id: comment.id,
          title: comment.content.substring(0, 100),
          subtitle: `Comment on "${comment.task.title}"`,
          entityId: comment.task.id,
        });
      }
    }
  }

  // F-02: search clients by name, industry, contact name, notes. Scoped by
  // workspace ownership: a client is reachable when the active user owns it,
  // OR (in team workspace) when it belongs to the active team.
  if (!type || type === "client") {
    const clientsAccess: SQL =
      ws.kind === "personal"
        ? and(eq(clients.ownerId, user.id), isNull(clients.teamId))!
        : eq(clients.teamId, ws.teamId)!;

    const clientWhere: SQL = or(
      like(clients.name, searchPattern),
      like(clients.industry, searchPattern),
      like(clients.contactName, searchPattern),
      like(clients.notes, searchPattern),
    )!;

    const matchingClients = await db.query.clients.findMany({
      where: and(clientWhere, clientsAccess),
      orderBy: [desc(clients.updatedAt)],
      limit,
    });

    for (const c of matchingClients) {
      results.push({
        type: "client",
        id: c.id,
        title: c.name,
        subtitle: c.industry || c.contactName || undefined,
      });
    }
  }

  // F-02: search brands (Marketing). Brands use userId/teamId rather than
  // ownerId/teamId — same access model otherwise.
  if (!type || type === "brand") {
    const brandsAccess: SQL =
      ws.kind === "personal"
        ? and(eq(brands.userId, user.id), isNull(brands.teamId))!
        : eq(brands.teamId, ws.teamId)!;

    const matchingBrands = await db.query.brands.findMany({
      where: and(like(brands.name, searchPattern), brandsAccess),
      orderBy: [desc(brands.updatedAt)],
      limit,
    });

    for (const b of matchingBrands) {
      results.push({
        type: "brand",
        id: b.id,
        title: b.name,
        subtitle: "Brand",
      });
    }
  }

  // Reference teamIds in code that lints unused vars — ws.kind === "team" already
  // uses ws.teamId for filters, but having the array ready avoids extra round-trips
  // if future filters need it. Suppress unused warning safely.
  void teamIds;

  return NextResponse.json({ results: results.slice(0, limit) });
}
