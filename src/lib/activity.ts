import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { v4 as uuid } from "uuid";

type LogActivityParams = {
  entityType: "task" | "project" | "team";
  entityId: string;
  userId: string | null;
  action: "created" | "updated" | "deleted" | "commented" | "moved" | "completed" | "assigned";
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logActivity(params: LogActivityParams) {
  try {
    await db.insert(activityLog).values({
      id: uuid(),
      entityType: params.entityType,
      entityId: params.entityId,
      userId: params.userId,
      action: params.action,
      field: params.field || null,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

/**
 * Log multiple field changes from a task update
 */
export async function logTaskUpdates(
  taskId: string,
  userId: string,
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
) {
  const trackedFields = ["title", "description", "status", "priority", "assigneeId", "dueDate"];

  for (const field of trackedFields) {
    if (updates[field] !== undefined && updates[field] !== existing[field]) {
      const action = field === "status" && updates[field] === "done"
        ? "completed"
        : field === "assigneeId"
          ? "assigned"
          : field === "status"
            ? "moved"
            : "updated";

      await logActivity({
        entityType: "task",
        entityId: taskId,
        userId,
        action,
        field,
        oldValue: existing[field] != null ? String(existing[field]) : null,
        newValue: updates[field] != null ? String(updates[field]) : null,
      });
    }
  }
}
