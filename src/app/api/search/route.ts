import { db } from "@/db";
import { tasks, projects, taskComments, teamMembers } from "@/db/schema";
import { eq, or, like, desc } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

// Search across tasks, projects, and comments
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

  const searchPattern = `%${query}%`;
  const results: Array<{
    type: string;
    id: string;
    title: string;
    subtitle?: string;
    entityId?: string;
  }> = [];

  // Get accessible project IDs for the user
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id!),
    columns: { teamId: true },
  });
  const teamIds = userTeams.map((t) => t.teamId);

  // Search tasks
  if (!type || type === "task") {
    const matchingTasks = await db.query.tasks.findMany({
      where: or(
        like(tasks.title, searchPattern),
        like(tasks.description, searchPattern),
      ),
      with: {
        project: { columns: { id: true, name: true, ownerId: true, teamId: true } },
      },
      orderBy: [desc(tasks.updatedAt)],
      limit,
    });

    // Filter to accessible tasks
    for (const task of matchingTasks) {
      if (
        task.project.ownerId === user.id ||
        (task.project.teamId && teamIds.includes(task.project.teamId))
      ) {
        results.push({
          type: "task",
          id: task.id,
          title: task.title,
          subtitle: `${task.project.name} - ${task.status}`,
        });
      }
    }
  }

  // Search projects
  if (!type || type === "project") {
    const matchingProjects = await db.query.projects.findMany({
      where: or(
        like(projects.name, searchPattern),
        like(projects.description, searchPattern),
      ),
      orderBy: [desc(projects.updatedAt)],
      limit,
    });

    for (const project of matchingProjects) {
      if (
        project.ownerId === user.id ||
        (project.teamId && teamIds.includes(project.teamId))
      ) {
        results.push({
          type: "project",
          id: project.id,
          title: project.name,
          subtitle: project.description || undefined,
        });
      }
    }
  }

  // Search comments
  if (!type || type === "comment") {
    const matchingComments = await db.query.taskComments.findMany({
      where: like(taskComments.content, searchPattern),
      with: {
        task: {
          columns: { id: true, title: true },
          with: {
            project: { columns: { ownerId: true, teamId: true } },
          },
        },
        author: { columns: { name: true } },
      },
      orderBy: [desc(taskComments.createdAt)],
      limit: Math.min(limit, 10),
    });

    for (const comment of matchingComments) {
      if (
        comment.task.project.ownerId === user.id ||
        (comment.task.project.teamId && teamIds.includes(comment.task.project.teamId))
      ) {
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

  return NextResponse.json({ results: results.slice(0, limit) });
}
