import { db } from "@/db";
import { teamMembers, tasks, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");

  // If no teamId, return the current user's workload (personal view)
  let members: { id: string; userId: string; name: string; email: string }[];
  if (!teamId) {
    const me = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { id: true, name: true, email: true },
    });
    if (!me) return NextResponse.json({ members: [] });
    members = [{ id: me.id, userId: me.id, name: me.name, email: me.email }];
  } else {
    // Get all team members with user info
    members = await db
      .select({
        id: teamMembers.id,
        userId: teamMembers.userId,
        name: users.name,
        email: users.email,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));
  }

  const now = new Date();

  // For each member, get their task statistics
  const memberWorkload = await Promise.all(
    members.map(async (member) => {
      const memberTasks = await db
        .select({
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          estimatedHours: tasks.estimatedHours,
        })
        .from(tasks)
        .where(eq(tasks.assigneeId, member.userId));

      let todoTasks = 0;
      let inProgressTasks = 0;
      let completedTasks = 0;
      let overdueTasks = 0;
      let totalEstimatedHours = 0;
      const tasksByPriority = { low: 0, medium: 0, high: 0, urgent: 0 };

      for (const task of memberTasks) {
        switch (task.status) {
          case "todo":
            todoTasks++;
            break;
          case "in_progress":
            inProgressTasks++;
            break;
          case "done":
            completedTasks++;
            break;
        }

        if (task.dueDate && task.dueDate < now && task.status !== "done") {
          overdueTasks++;
        }

        if (task.estimatedHours) {
          totalEstimatedHours += task.estimatedHours;
        }

        if (task.priority in tasksByPriority) {
          tasksByPriority[task.priority as keyof typeof tasksByPriority]++;
        }
      }

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        totalTasks: memberTasks.length,
        todoTasks,
        inProgressTasks,
        completedTasks,
        overdueTasks,
        totalEstimatedHours,
        tasksByPriority,
      };
    })
  );

  return NextResponse.json({ members: memberWorkload });
}
