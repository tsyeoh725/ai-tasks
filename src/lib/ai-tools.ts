import { tool } from "ai";
import { z } from "zod";
import { db } from "@/db";
import {
  tasks, projects, teams, teamMembers, users,
  userPreferences, timeBlocks, calendarEvents,
  brands, metaAds, decisionJournal,
} from "@/db/schema";
import { eq, and, or, lt, ne, like, sql, inArray, gte, lte } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { sendTelegramMessage } from "@/lib/telegram";
import { getUserPreferences, getFreeSlots, getBlocksForDateRange } from "./time-blocker";
import { getAccessibleProjectIds } from "@/lib/queries/projects";
import { getOverdueTasks } from "@/lib/queries/tasks";
import { notifyTeamMemberAdded } from "@/lib/notifications";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere, canAccessBrand } from "@/lib/brand-access";

/**
 * Returns AI SDK v6 tools scoped to the given user.
 * Each tool validates access through the userId closure.
 */
export function getCommandTools(userId: string) {
  return {
    createTask: tool({
      description: "Create a new task in a project. You must know the projectId. Ask the user which project if unclear.",
      inputSchema: z.object({
        title: z.string().describe("Task title"),
        projectId: z.string().describe("Project ID to create the task in"),
        description: z.string().optional().describe("Task description"),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        status: z.enum(["todo", "in_progress", "done", "blocked"]).default("todo"),
        dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format"),
        assigneeId: z.string().optional().describe("User ID to assign the task to"),
      }),
      execute: async ({ title, projectId, description, priority, status, dueDate, assigneeId }) => {
        const project = await db.query.projects.findFirst({
          where: eq(projects.id, projectId),
        });
        if (!project) return { error: "Project not found" };

        const hasAccess = await checkProjectAccess(userId, project);
        if (!hasAccess) return { error: "You don't have access to this project" };

        const id = uuid();
        try {
          // Validate assigneeId if provided
          if (assigneeId) {
            const assignee = await db.query.users.findFirst({
              where: eq(users.id, assigneeId),
            });
            if (!assignee) return { error: `Assignee not found with ID: ${assigneeId}. Use searchUsers to find the correct user ID.` };
          }

          await db.insert(tasks).values({
            id,
            title,
            description: description || null,
            priority,
            status,
            projectId,
            createdById: userId,
            assigneeId: assigneeId || null,
            dueDate: dueDate ? new Date(dueDate) : null,
          });

          return { success: true, taskId: id, title, project: project.name };
        } catch (err: unknown) {
          return { error: `Failed to create task: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    }),

    updateTask: tool({
      description: "Update an existing task's fields (title, description, status, priority, dueDate, assigneeId).",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to update"),
        title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format, or 'clear' to remove"),
        assigneeId: z.string().optional().describe("User ID to assign, or 'clear' to unassign"),
      }),
      execute: async ({ taskId, ...updates }) => {
        const task = await db.query.tasks.findFirst({
          where: eq(tasks.id, taskId),
          with: { project: true },
        });
        if (!task) return { error: "Task not found" };

        const hasAccess = await checkProjectAccess(userId, task.project);
        if (!hasAccess) return { error: "You don't have access to this task" };

        const setValues: Record<string, unknown> = { updatedAt: new Date() };
        if (updates.title) setValues.title = updates.title;
        if (updates.description !== undefined) setValues.description = updates.description;
        if (updates.status) {
          setValues.status = updates.status;
          if (updates.status === "done") setValues.completedAt = new Date();
        }
        if (updates.priority) setValues.priority = updates.priority;
        if (updates.dueDate === "clear") setValues.dueDate = null;
        else if (updates.dueDate) setValues.dueDate = new Date(updates.dueDate);
        if (updates.assigneeId === "clear") setValues.assigneeId = null;
        else if (updates.assigneeId) setValues.assigneeId = updates.assigneeId;

        await db.update(tasks).set(setValues).where(eq(tasks.id, taskId));
        return { success: true, taskId, updated: Object.keys(setValues).filter(k => k !== "updatedAt") };
      },
    }),

    deleteTask: tool({
      description: "Delete a task permanently. Use with caution.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to delete"),
      }),
      execute: async ({ taskId }) => {
        const task = await db.query.tasks.findFirst({
          where: eq(tasks.id, taskId),
          with: { project: true },
        });
        if (!task) return { error: "Task not found" };

        const hasAccess = await checkProjectAccess(userId, task.project);
        if (!hasAccess) return { error: "You don't have access to this task" };

        await db.delete(tasks).where(eq(tasks.id, taskId));
        return { success: true, deleted: task.title };
      },
    }),

    listTasks: tool({
      description: "List tasks with optional filters. By default EXCLUDES done/completed tasks (pass includeDone: true to show them). Returns up to 50 tasks plus counts of what was filtered out so you can tell the user if their filter was too restrictive.",
      inputSchema: z.object({
        projectId: z.string().optional().describe("Filter by project ID"),
        status: z.enum(["todo", "in_progress", "done", "blocked"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        assigneeId: z.string().optional().describe("Filter by assignee user ID"),
        assignedToMe: z.boolean().optional().describe("Show only tasks assigned to the current user"),
        overdue: z.boolean().optional().describe("Show only overdue tasks"),
        includeDone: z.boolean().optional().describe("Include completed (done) tasks. Defaults to false."),
      }),
      execute: async ({ projectId, status, priority, assigneeId, assignedToMe, overdue, includeDone }) => {
        const accessibleProjectIds = await getAccessibleProjectIds(userId);
        if (accessibleProjectIds.length === 0) {
          return { tasks: [], count: 0, note: "You have no accessible projects. Create one first." };
        }

        const conditions = [];

        if (projectId) {
          if (!accessibleProjectIds.includes(projectId)) return { error: "No access to this project" };
          conditions.push(eq(tasks.projectId, projectId));
        } else {
          conditions.push(inArray(tasks.projectId, accessibleProjectIds));
        }

        if (status) conditions.push(eq(tasks.status, status));
        if (priority) conditions.push(eq(tasks.priority, priority));
        if (assigneeId) conditions.push(eq(tasks.assigneeId, assigneeId));
        if (assignedToMe) conditions.push(eq(tasks.assigneeId, userId));
        if (overdue) {
          conditions.push(lt(tasks.dueDate, new Date()));
          conditions.push(ne(tasks.status, "done"));
        }
        // Default: exclude done unless includeDone or status='done' explicitly set
        if (!includeDone && status !== "done" && !overdue) {
          conditions.push(ne(tasks.status, "done"));
        }

        const result = await db.query.tasks.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: {
            project: { columns: { name: true, color: true } },
            assignee: { columns: { name: true } },
          },
          limit: 50,
          orderBy: (t, { desc }) => [desc(t.createdAt)],
        });

        // If empty, give helpful context about what ELSE exists
        let note: string | undefined;
        if (result.length === 0) {
          const totalAccessible = await db.query.tasks.findMany({
            where: inArray(tasks.projectId, accessibleProjectIds),
            columns: { id: true, status: true, assigneeId: true },
          });
          const mine = totalAccessible.filter((t) => t.assigneeId === userId);
          const mineOpen = mine.filter((t) => t.status !== "done");
          note = `No tasks match your filters. For reference: ${totalAccessible.length} total accessible tasks, ${mine.length} assigned to you (${mineOpen.length} open / ${mine.length - mineOpen.length} done).`;
        }

        return {
          tasks: result.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            project: t.project.name,
            assignee: t.assignee?.name || null,
            dueDate: t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : null,
          })),
          count: result.length,
          ...(note && { note }),
        };
      },
    }),

    getTaskDetails: tool({
      description: "Get full details of a specific task including subtasks, comments, and labels.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID"),
      }),
      execute: async ({ taskId }) => {
        const task = await db.query.tasks.findFirst({
          where: eq(tasks.id, taskId),
          with: {
            project: { columns: { name: true } },
            assignee: { columns: { id: true, name: true } },
            createdBy: { columns: { name: true } },
            subtasks: true,
            comments: {
              limit: 10,
              orderBy: (c, { desc }) => [desc(c.createdAt)],
            },
            labels: { with: { label: true } },
          },
        });
        if (!task) return { error: "Task not found" };

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          project: task.project.name,
          assignee: task.assignee?.name || null,
          createdBy: task.createdBy.name,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : null,
          subtasks: task.subtasks.map(s => ({ title: s.title, done: s.isDone })),
          recentComments: task.comments.reverse().map(c => ({
            content: c.content.substring(0, 200),
            isAi: c.isAi,
          })),
          labels: task.labels.map(l => l.label.name),
        };
      },
    }),

    createProject: tool({
      description: "Create a new project. If teamId is provided, it's a team project; otherwise personal.",
      inputSchema: z.object({
        name: z.string().describe("Project name"),
        description: z.string().optional(),
        color: z.string().optional().describe("Hex color code like #6366f1"),
        teamId: z.string().optional().describe("Team ID for a team project, omit for personal"),
      }),
      execute: async ({ name, description, color, teamId }) => {
        if (teamId) {
          const membership = await db.query.teamMembers.findFirst({
            where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
          });
          if (!membership) return { error: "You're not a member of this team" };
        }

        const id = uuid();
        await db.insert(projects).values({
          id,
          name,
          description: description || null,
          color: color || "#6366f1",
          teamId: teamId || null,
          ownerId: userId,
        });

        return { success: true, projectId: id, name };
      },
    }),

    listProjects: tool({
      description: "List all projects the user has access to (personal + team projects).",
      inputSchema: z.object({
        teamId: z.string().optional().describe("Filter by team ID"),
      }),
      execute: async ({ teamId }) => {
        const result = await getAccessibleProjects(userId, teamId);
        return {
          projects: result.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            color: p.color,
            team: p.teamId ? "team" : "personal",
          })),
          count: result.length,
        };
      },
    }),

    createTeam: tool({
      description: "Create a new team. The current user becomes the owner.",
      inputSchema: z.object({
        name: z.string().describe("Team name"),
        description: z.string().optional(),
      }),
      execute: async ({ name, description }) => {
        const teamId = uuid();
        await db.insert(teams).values({
          id: teamId,
          name,
          description: description || null,
          ownerId: userId,
        });

        await db.insert(teamMembers).values({
          id: uuid(),
          teamId,
          userId,
          role: "owner",
        });

        return { success: true, teamId, name };
      },
    }),

    inviteTeamMember: tool({
      description: "Invite a user to a team by email. The user must already have an account.",
      inputSchema: z.object({
        teamId: z.string().describe("Team ID"),
        email: z.string().describe("Email of the user to invite"),
      }),
      execute: async ({ teamId, email }) => {
        const membership = await db.query.teamMembers.findFirst({
          where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
        });
        if (!membership || membership.role === "member") {
          return { error: "Only team admins/owners can invite members" };
        }

        const targetUser = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (!targetUser) return { error: "No user found with that email. They need to register first." };

        const existing = await db.query.teamMembers.findFirst({
          where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUser.id)),
        });
        if (existing) return { error: "User is already a member of this team" };

        await db.insert(teamMembers).values({
          id: uuid(),
          teamId,
          userId: targetUser.id,
          role: "member",
        });

        const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
        const inviter = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (team) {
          await notifyTeamMemberAdded(
            targetUser.id,
            inviter?.name || inviter?.email || "A teammate",
            team.name,
            teamId,
          );
        }

        return { success: true, invited: targetUser.name, email: targetUser.email };
      },
    }),

    queryOverdueTasks: tool({
      description: "Get all overdue tasks (past due date, not completed) for the current user.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await getOverdueTasks(userId);
        return {
          tasks: result.map((t) => ({
            id: t.id,
            title: t.title,
            project: t.projectName,
            assignee: t.assignee?.name || null,
            dueDate: t.dueDate ? t.dueDate.split("T")[0] : null,
            priority: t.priority,
            daysOverdue: t.dueDate
              ? Math.floor((Date.now() - new Date(t.dueDate).getTime()) / 86400000)
              : 0,
          })),
          count: result.length,
        };
      },
    }),

    queryTaskStats: tool({
      description: "Get task statistics — counts by status and priority. Optionally scoped to a project.",
      inputSchema: z.object({
        projectId: z.string().optional().describe("Project ID to scope stats to"),
      }),
      execute: async ({ projectId }) => {
        const accessibleProjectIds = await getAccessibleProjectIds(userId);
        if (accessibleProjectIds.length === 0) return { total: 0, byStatus: {}, byPriority: {} };

        const conditions = [];
        if (projectId) {
          if (!accessibleProjectIds.includes(projectId)) return { error: "No access" };
          conditions.push(eq(tasks.projectId, projectId));
        } else {
          conditions.push(inArray(tasks.projectId, accessibleProjectIds));
        }

        const allTasks = await db.query.tasks.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          columns: { status: true, priority: true },
        });

        const byStatus: Record<string, number> = {};
        const byPriority: Record<string, number> = {};
        for (const t of allTasks) {
          byStatus[t.status] = (byStatus[t.status] || 0) + 1;
          byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
        }

        return { total: allTasks.length, byStatus, byPriority };
      },
    }),

    sendTelegramNotification: tool({
      description: "Send a Telegram message to a team member. The recipient must have linked their Telegram account.",
      inputSchema: z.object({
        recipientUserId: z.string().describe("User ID of the recipient"),
        message: z.string().describe("Message to send"),
      }),
      execute: async ({ recipientUserId, message }) => {
        const recipient = await db.query.users.findFirst({
          where: eq(users.id, recipientUserId),
        });
        if (!recipient) return { error: "User not found" };

        try {
          await sendTelegramMessage(recipientUserId, message);
          return { success: true, sentTo: recipient.name };
        } catch {
          return { error: "Failed to send message. User may not have linked Telegram." };
        }
      },
    }),

    searchUsers: tool({
      description: "Search for users by name or email. Useful before assigning tasks or sending messages.",
      inputSchema: z.object({
        query: z.string().describe("Search query (name or email)"),
      }),
      execute: async ({ query }) => {
        const result = await db.query.users.findMany({
          where: or(
            like(users.name, `%${query}%`),
            like(users.email, `%${query}%`),
          ),
          columns: { id: true, name: true, email: true },
          limit: 10,
        });

        return { users: result, count: result.length };
      },
    }),

    // ---- Schedule-Aware AI Tools ----

    getMySchedule: tool({
      description: "Get today's or a specific day's schedule — time blocks, free slots, and calendar events.",
      inputSchema: z.object({
        date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      }),
      execute: async ({ date }) => {
        const targetDate = date ? new Date(date) : new Date();
        const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);

        const prefs = await getUserPreferences(userId);
        const blocks = await getBlocksForDateRange(userId, dayStart, dayEnd);
        const freeSlots = await getFreeSlots(userId, dayStart);

        const events = await db.query.calendarEvents.findMany({
          where: and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.startTime, dayStart),
            lte(calendarEvents.endTime, dayEnd),
          ),
        });

        return {
          date: dayStart.toISOString().split("T")[0],
          workHours: { start: prefs.workStartTime, end: prefs.workEndTime, lunch: `${prefs.lunchStartTime}-${prefs.lunchEndTime}` },
          blocks: blocks.map(b => ({
            id: b.id,
            title: b.title,
            category: b.category,
            start: b.startTime.toISOString(),
            end: b.endTime.toISOString(),
            locked: b.isLocked,
            taskId: b.taskId,
          })),
          calendarEvents: events.map(e => ({
            title: e.title,
            start: e.startTime.toISOString(),
            end: e.endTime.toISOString(),
          })),
          freeSlots: freeSlots.map(s => ({
            start: s.start.toISOString(),
            end: s.end.toISOString(),
            durationMinutes: Math.round((s.end.getTime() - s.start.getTime()) / 60000),
          })),
          totalFreeMinutes: freeSlots.reduce((sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000), 0),
        };
      },
    }),

    getAvailability: tool({
      description: "Check available working time between two dates. Returns total free hours and daily breakdown.",
      inputSchema: z.object({
        startDate: z.string().describe("Start date YYYY-MM-DD"),
        endDate: z.string().describe("End date YYYY-MM-DD"),
      }),
      execute: async ({ startDate, endDate }) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days: { date: string; freeMinutes: number }[] = [];
        let totalFreeMinutes = 0;

        const current = new Date(start);
        while (current <= end) {
          // Skip weekends
          const dow = current.getDay();
          if (dow !== 0 && dow !== 6) {
            const freeSlots = await getFreeSlots(userId, new Date(current));
            const dayFree = freeSlots.reduce((sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000), 0);
            days.push({ date: current.toISOString().split("T")[0], freeMinutes: dayFree });
            totalFreeMinutes += dayFree;
          }
          current.setDate(current.getDate() + 1);
        }

        return {
          totalFreeHours: Math.round(totalFreeMinutes / 60 * 10) / 10,
          totalFreeMinutes,
          days,
        };
      },
    }),

    blockTimeForTask: tool({
      description: "Create a time block for a specific task on a given date and time.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to block time for"),
        date: z.string().describe("Date YYYY-MM-DD"),
        startTime: z.string().describe("Start time HH:MM (24h)"),
        durationMinutes: z.number().describe("Duration in minutes"),
        category: z.enum(["deep_work", "creative", "admin", "review", "quick_tasks"]).default("deep_work"),
      }),
      execute: async ({ taskId, date, startTime, durationMinutes, category }) => {
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
        if (!task) return { error: "Task not found" };

        const [h, m] = startTime.split(":").map(Number);
        const start = new Date(date);
        start.setHours(h, m, 0, 0);
        const end = new Date(start.getTime() + durationMinutes * 60000);

        const blockId = uuid();
        await db.insert(timeBlocks).values({
          id: blockId,
          userId,
          taskId,
          title: task.title,
          category,
          startTime: start,
          endTime: end,
          isLocked: false,
          aiGenerated: false,
        });

        return { success: true, blockId, task: task.title, start: start.toISOString(), end: end.toISOString() };
      },
    }),

    rescheduleTask: tool({
      description: "Reschedule a task by changing its due date and removing any existing time blocks for it.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to reschedule"),
        newDueDate: z.string().describe("New due date YYYY-MM-DD"),
      }),
      execute: async ({ taskId, newDueDate }) => {
        const task = await db.query.tasks.findFirst({
          where: eq(tasks.id, taskId),
          with: { project: true },
        });
        if (!task) return { error: "Task not found" };

        const oldDue = task.dueDate ? task.dueDate.toISOString().split("T")[0] : "none";

        await db.update(tasks).set({
          dueDate: new Date(newDueDate),
          updatedAt: new Date(),
        }).where(eq(tasks.id, taskId));

        // Remove existing time blocks for this task
        await db.delete(timeBlocks).where(
          and(eq(timeBlocks.taskId, taskId), eq(timeBlocks.userId, userId))
        );

        return { success: true, task: task.title, oldDueDate: oldDue, newDueDate };
      },
    }),

    analyzeWorkload: tool({
      description: "Analyze if current tasks fit in available time. Returns warnings for tasks that can't be completed before their deadlines.",
      inputSchema: z.object({
        days: z.number().default(7).describe("Number of days to analyze (default 7)"),
      }),
      execute: async ({ days }) => {
        const accessibleProjectIds = await getAccessibleProjectIds(userId);
        if (accessibleProjectIds.length === 0) return { warnings: [], summary: "No projects found" };

        const activeTasks = await db.query.tasks.findMany({
          where: and(
            inArray(tasks.projectId, accessibleProjectIds),
            eq(tasks.assigneeId, userId),
            ne(tasks.status, "done"),
          ),
          orderBy: (t, { asc }) => [asc(t.dueDate)],
        });

        // Calculate available time
        let totalFreeMinutes = 0;
        const today = new Date();
        for (let i = 0; i < days; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          if (d.getDay() === 0 || d.getDay() === 6) continue;
          const freeSlots = await getFreeSlots(userId, d);
          totalFreeMinutes += freeSlots.reduce((sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000), 0);
        }

        // Calculate needed time
        let totalNeededMinutes = 0;
        const warnings: { taskId: string; title: string; dueDate: string | null; estimatedHours: number; warning: string }[] = [];

        for (const t of activeTasks) {
          const est = (t.estimatedHours || 1) * 60;
          totalNeededMinutes += est;

          if (t.dueDate) {
            const daysUntilDue = Math.ceil((t.dueDate.getTime() - today.getTime()) / 86400000);
            if (daysUntilDue < 0) {
              warnings.push({
                taskId: t.id,
                title: t.title,
                dueDate: t.dueDate.toISOString().split("T")[0],
                estimatedHours: t.estimatedHours || 1,
                warning: `OVERDUE by ${Math.abs(daysUntilDue)} days`,
              });
            } else if (daysUntilDue <= 1 && est > 120) {
              warnings.push({
                taskId: t.id,
                title: t.title,
                dueDate: t.dueDate.toISOString().split("T")[0],
                estimatedHours: t.estimatedHours || 1,
                warning: `Due tomorrow but needs ${Math.round(est / 60)}h of work`,
              });
            }
          }
        }

        const overloaded = totalNeededMinutes > totalFreeMinutes;

        return {
          totalTasks: activeTasks.length,
          totalNeededHours: Math.round(totalNeededMinutes / 60 * 10) / 10,
          totalFreeHours: Math.round(totalFreeMinutes / 60 * 10) / 10,
          overloaded,
          overloadHours: overloaded ? Math.round((totalNeededMinutes - totalFreeMinutes) / 60 * 10) / 10 : 0,
          warnings,
          summary: overloaded
            ? `You have ${Math.round(totalNeededMinutes / 60)}h of work but only ${Math.round(totalFreeMinutes / 60)}h available in the next ${days} days. Consider rescheduling ${warnings.length} task(s).`
            : `Workload fits! ${Math.round(totalNeededMinutes / 60)}h needed, ${Math.round(totalFreeMinutes / 60)}h available.`,
        };
      },
    }),

    setWorkHours: tool({
      description: "Update the user's work hours and schedule preferences.",
      inputSchema: z.object({
        workStartTime: z.string().optional().describe("Work start time HH:MM"),
        workEndTime: z.string().optional().describe("Work end time HH:MM"),
        lunchStartTime: z.string().optional().describe("Lunch start time HH:MM"),
        lunchEndTime: z.string().optional().describe("Lunch end time HH:MM"),
        focusTimePreference: z.enum(["morning", "afternoon", "mixed"]).optional(),
      }),
      execute: async ({ workStartTime, workEndTime, lunchStartTime, lunchEndTime, focusTimePreference }) => {
        const existing = await db.query.userPreferences.findFirst({
          where: eq(userPreferences.userId, userId),
        });

        const values: Record<string, unknown> = { updatedAt: new Date() };
        if (workStartTime) values.workStartTime = workStartTime;
        if (workEndTime) values.workEndTime = workEndTime;
        if (lunchStartTime) values.lunchStartTime = lunchStartTime;
        if (lunchEndTime) values.lunchEndTime = lunchEndTime;
        if (focusTimePreference) values.focusTimePreference = focusTimePreference;

        if (existing) {
          await db.update(userPreferences).set(values).where(eq(userPreferences.id, existing.id));
        } else {
          await db.insert(userPreferences).values({
            id: uuid(),
            userId,
            ...values,
          } as typeof userPreferences.$inferInsert);
        }

        return { success: true, updated: Object.keys(values).filter(k => k !== "updatedAt") };
      },
    }),

    suggestReschedule: tool({
      description: "Analyze tasks that can't fit in available time and suggest rescheduling options.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to find new time for"),
      }),
      execute: async ({ taskId }) => {
        const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
        if (!task) return { error: "Task not found" };

        const estMinutes = (task.estimatedHours || 1) * 60;
        const today = new Date();
        const suggestions: { date: string; freeMinutes: number; fits: boolean }[] = [];

        // Check next 14 days for availability
        for (let i = 1; i <= 14; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          if (d.getDay() === 0 || d.getDay() === 6) continue;

          const freeSlots = await getFreeSlots(userId, d);
          const dayFree = freeSlots.reduce((sum, s) => sum + Math.round((s.end.getTime() - s.start.getTime()) / 60000), 0);
          if (dayFree >= 30) {
            suggestions.push({
              date: d.toISOString().split("T")[0],
              freeMinutes: dayFree,
              fits: dayFree >= estMinutes,
            });
          }
          if (suggestions.length >= 5) break;
        }

        return {
          task: task.title,
          currentDueDate: task.dueDate ? task.dueDate.toISOString().split("T")[0] : null,
          estimatedHours: task.estimatedHours || 1,
          suggestions,
        };
      },
    }),

    // ---- Marketing (Meta Ads Optimizer) Tools ----

    listBrands: tool({
      description: "List all ad brands accessible in the user's active workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        const ws = await resolveWorkspaceForUser(userId);
        const userBrands = await db.query.brands.findMany({
          where: brandsAccessibleWhere(ws, userId),
        });
        return { brands: userBrands.map(b => ({ id: b.id, name: b.name, metaAccountId: b.metaAccountId, projectId: b.projectId, teamId: b.teamId ?? null })) };
      },
    }),

    moveBrandToTeam: tool({
      description: "Move an ad brand to a team workspace, or back to personal. The brand's linked ai-tasks project moves with it. Pass teamId=null (or omit) to move to personal.",
      inputSchema: z.object({
        brandId: z.string(),
        teamId: z.string().nullable().optional().describe("Target team id, or null to move to personal."),
      }),
      execute: async ({ brandId, teamId }) => {
        const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
        if (!brand) return { error: "Brand not found" };
        if (!(await canAccessBrand(brand, userId))) return { error: "Forbidden — you don't have access to this brand" };

        const target: string | null = teamId ?? null;
        if (target) {
          const membership = await db.query.teamMembers.findFirst({
            where: and(eq(teamMembers.teamId, target), eq(teamMembers.userId, userId)),
          });
          if (!membership) return { error: "You're not a member of the target team" };
        }

        await db.update(brands).set({ teamId: target, updatedAt: new Date() }).where(eq(brands.id, brandId));
        if (brand.projectId) {
          await db.update(projects).set({ teamId: target, updatedAt: new Date() }).where(eq(projects.id, brand.projectId));
        }
        return { success: true, brand: brand.name, movedTo: target ? "team" : "personal", teamId: target };
      },
    }),

    getBrandHealth: tool({
      description: "Get current KPIs vs thresholds for a brand. Returns summary of how the brand's ads are performing.",
      inputSchema: z.object({ brandId: z.string() }),
      execute: async ({ brandId }) => {
        const brand = await db.query.brands.findFirst({
          where: eq(brands.id, brandId),
        });
        if (!brand || !(await canAccessBrand(brand, userId))) return { error: "Brand not found" };
        const ads = await db.query.metaAds.findMany({
          where: and(eq(metaAds.brandId, brandId), eq(metaAds.status, "ACTIVE")),
          limit: 50,
        });
        // Compute aggregates
        const totalSpend = ads.reduce((s, a) => s + (a.spend || 0), 0);
        const totalLeads = ads.reduce((s, a) => s + (a.leads || 0), 0);
        const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
        const avgCtr = ads.length > 0 ? ads.reduce((s, a) => s + (a.ctr || 0), 0) / ads.length : 0;
        const config = brand.config ? JSON.parse(brand.config) : {};
        return {
          brand: brand.name,
          activeAds: ads.length,
          totalSpend: Math.round(totalSpend * 100) / 100,
          totalLeads,
          avgCpl: Math.round(avgCpl * 100) / 100,
          avgCtr: Math.round(avgCtr * 1000) / 10, // percent
          thresholds: config.thresholds || {},
        };
      },
    }),

    listPendingApprovals: tool({
      description: "List AI Guard recommendations awaiting human approval across brands accessible in the active workspace.",
      inputSchema: z.object({}),
      execute: async () => {
        const ws = await resolveWorkspaceForUser(userId);
        const accessible = await db.query.brands.findMany({
          where: brandsAccessibleWhere(ws, userId),
          columns: { id: true },
        });
        const accessibleIds = accessible.map((b) => b.id);
        if (accessibleIds.length === 0) return { pending: [] };
        const pending = await db.query.decisionJournal.findMany({
          where: and(inArray(decisionJournal.brandId, accessibleIds), eq(decisionJournal.guardVerdict, "pending")),
          limit: 20,
          orderBy: (d, { desc }) => [desc(d.createdAt)],
        });
        return { pending: pending.map(p => ({ id: p.id, recommendation: p.recommendation, reason: p.reason, confidence: p.confidence, riskLevel: p.riskLevel })) };
      },
    }),

    approveRecommendation: tool({
      description: "Approve a pending AI Guard recommendation by journal entry ID. The action will execute on Meta.",
      inputSchema: z.object({ journalId: z.string() }),
      execute: async ({ journalId }) => {
        const entry = await db.query.decisionJournal.findFirst({
          where: eq(decisionJournal.id, journalId),
        });
        if (!entry) return { error: "Journal entry not found" };
        const brand = await db.query.brands.findFirst({ where: eq(brands.id, entry.brandId) });
        if (!brand || !(await canAccessBrand(brand, userId))) return { error: "Forbidden" };
        await db.update(decisionJournal).set({ guardVerdict: "approved" }).where(eq(decisionJournal.id, journalId));
        const { executeJournalEntry } = await import("@/lib/marketing/action-executor");
        const result = await executeJournalEntry(journalId);
        return { success: true, result };
      },
    }),

    rejectRecommendation: tool({
      description: "Reject a pending AI Guard recommendation. No action is taken.",
      inputSchema: z.object({ journalId: z.string(), reason: z.string().optional() }),
      execute: async ({ journalId, reason }) => {
        const entry = await db.query.decisionJournal.findFirst({ where: eq(decisionJournal.id, journalId) });
        if (!entry) return { error: "Journal entry not found" };
        const brand = await db.query.brands.findFirst({ where: eq(brands.id, entry.brandId) });
        if (!brand || !(await canAccessBrand(brand, userId))) return { error: "Forbidden" };
        await db.update(decisionJournal).set({ guardVerdict: "rejected" }).where(eq(decisionJournal.id, journalId));
        return { success: true, note: reason };
      },
    }),

    runMonitorCycle: tool({
      description: "Trigger the ad monitor cycle on-demand. Without brandId, runs across all brands accessible in the active workspace.",
      inputSchema: z.object({ brandId: z.string().optional() }),
      execute: async ({ brandId }) => {
        const { runMonitorCycleForBrand } = await import("@/lib/marketing/core-monitor");
        if (brandId) {
          const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
          if (!brand || !(await canAccessBrand(brand, userId))) return { error: "Forbidden" };
          const result = await runMonitorCycleForBrand(brandId);
          return { result };
        }
        const ws = await resolveWorkspaceForUser(userId);
        const accessible = await db.query.brands.findMany({
          where: brandsAccessibleWhere(ws, userId),
          columns: { id: true },
        });
        const results = [];
        for (const b of accessible) {
          results.push(await runMonitorCycleForBrand(b.id));
        }
        return { results };
      },
    }),

    listAds: tool({
      description: "Query ads. Optionally filter by brand.",
      inputSchema: z.object({
        brandId: z.string().optional(),
        status: z.string().optional(),
      }),
      execute: async ({ brandId, status }) => {
        const ws = await resolveWorkspaceForUser(userId);
        const accessibleBrands = await db.query.brands.findMany({
          where: brandsAccessibleWhere(ws, userId),
          columns: { id: true },
        });
        const accessibleIds = accessibleBrands.map((b) => b.id);
        if (accessibleIds.length === 0) return { ads: [] };
        if (brandId && !accessibleIds.includes(brandId)) return { error: "Forbidden" };

        const conditions = [
          brandId ? eq(metaAds.brandId, brandId) : inArray(metaAds.brandId, accessibleIds),
        ];
        if (status) conditions.push(eq(metaAds.status, status));
        const ads = await db.query.metaAds.findMany({
          where: and(...conditions),
          limit: 30,
        });
        return { ads: ads.map(a => ({ id: a.id, name: a.name, status: a.status, cpl: a.cpl, ctr: a.ctr, spend: a.spend, leads: a.leads })) };
      },
    }),

    pauseAd: tool({
      description: "Pause a specific ad via Meta API.",
      inputSchema: z.object({ adId: z.string() }),
      execute: async ({ adId }) => {
        const { pauseAd: pauseAdFn } = await import("@/lib/marketing/meta-api");
        const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, adId) });
        if (!ad) return { error: "Ad not found" };
        const brand = await db.query.brands.findFirst({ where: eq(brands.id, ad.brandId) });
        if (!brand || !(await canAccessBrand(brand, userId))) return { error: "Forbidden" };
        await pauseAdFn(ad.metaAdId, process.env.META_ACCESS_TOKEN!);
        await db.update(metaAds).set({ status: "PAUSED" }).where(eq(metaAds.id, adId));
        return { success: true, ad: ad.name };
      },
    }),

    activateAd: tool({
      description: "Activate a paused ad via Meta API.",
      inputSchema: z.object({ adId: z.string() }),
      execute: async ({ adId }) => {
        const { activateAd: activateAdFn } = await import("@/lib/marketing/meta-api");
        const ad = await db.query.metaAds.findFirst({ where: eq(metaAds.id, adId) });
        if (!ad) return { error: "Ad not found" };
        const brand = await db.query.brands.findFirst({ where: eq(brands.id, ad.brandId) });
        if (!brand || !(await canAccessBrand(brand, userId))) return { error: "Forbidden" };
        await activateAdFn(ad.metaAdId, process.env.META_ACCESS_TOKEN!);
        await db.update(metaAds).set({ status: "ACTIVE" }).where(eq(metaAds.id, adId));
        return { success: true, ad: ad.name };
      },
    }),
  };
}

// ---- Helper functions ----

async function checkProjectAccess(
  userId: string,
  project: { ownerId: string; teamId: string | null }
): Promise<boolean> {
  if (project.ownerId === userId) return true;
  if (project.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, project.teamId), eq(teamMembers.userId, userId)),
    });
    return !!membership;
  }
  return false;
}

async function getAccessibleProjects(userId: string, filterTeamId?: string) {
  const personal = filterTeamId
    ? []
    : await db.query.projects.findMany({
        where: and(eq(projects.ownerId, userId), sql`${projects.teamId} IS NULL`),
      });

  const memberships = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, userId),
    columns: { teamId: true },
  });

  const teamIds = memberships.map(m => m.teamId);
  if (filterTeamId) {
    if (!teamIds.includes(filterTeamId)) return personal;
    const teamProjects = await db.query.projects.findMany({
      where: eq(projects.teamId, filterTeamId),
    });
    return [...personal, ...teamProjects];
  }

  if (teamIds.length === 0) return personal;

  const teamProjects = await db.query.projects.findMany({
    where: inArray(projects.teamId, teamIds),
  });

  return [...personal, ...teamProjects];
}
