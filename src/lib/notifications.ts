import { db } from "@/db";
import { notifications } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { sendPushToUser, sendPushToUsers } from "@/lib/push";

type CreateNotificationParams = {
  userId: string;
  type: "assigned" | "mentioned" | "commented" | "status_changed" | "due_soon" | "completed";
  title: string;
  message?: string;
  entityType?: "task" | "project" | "team";
  entityId?: string;
};

function pushUrlFor(entityType?: string, entityId?: string) {
  if (entityType === "task" && entityId) return `/tasks/${entityId}`;
  if (entityType === "project" && entityId) return `/projects/${entityId}`;
  return "/inbox";
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    await db.insert(notifications).values({
      id: uuid(),
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
    });
    sendPushToUser(params.userId, {
      title: params.title,
      body: params.message,
      url: pushUrlFor(params.entityType, params.entityId),
      tag: `${params.type}:${params.entityId ?? "n/a"}`,
    }).catch((err) => console.error("Push fan-out failed:", err));
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

/**
 * Create notifications for multiple users at once
 */
export async function createNotifications(
  userIds: string[],
  params: Omit<CreateNotificationParams, "userId">,
) {
  try {
    const values = userIds.map((userId) => ({
      id: uuid(),
      userId,
      type: params.type,
      title: params.title,
      message: params.message || null,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
    }));
    if (values.length > 0) {
      await db.insert(notifications).values(values);
      sendPushToUsers(userIds, {
        title: params.title,
        body: params.message,
        url: pushUrlFor(params.entityType, params.entityId),
        tag: `${params.type}:${params.entityId ?? "n/a"}`,
      }).catch((err) => console.error("Push fan-out failed:", err));
    }
  } catch (error) {
    console.error("Failed to create notifications:", error);
  }
}

/**
 * Notify when a task is assigned to someone
 */
export async function notifyTaskAssigned(
  assigneeId: string,
  assignerName: string,
  taskTitle: string,
  taskId: string,
) {
  await createNotification({
    userId: assigneeId,
    type: "assigned",
    title: `${assignerName} assigned you to "${taskTitle}"`,
    entityType: "task",
    entityId: taskId,
  });
}

/**
 * Notify when someone comments on a task
 */
export async function notifyTaskComment(
  recipientIds: string[],
  commenterName: string,
  taskTitle: string,
  taskId: string,
) {
  await createNotifications(recipientIds, {
    type: "commented",
    title: `${commenterName} commented on "${taskTitle}"`,
    entityType: "task",
    entityId: taskId,
  });
}
