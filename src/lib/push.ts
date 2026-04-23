import "server-only";
import webpush from "web-push";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  });
  return await deliver(subs, payload);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!ensureConfigured() || userIds.length === 0) return { sent: 0, pruned: 0 };
  const subs = await db.query.pushSubscriptions.findMany({
    where: inArray(pushSubscriptions.userId, userIds),
  });
  return await deliver(subs, payload);
}

async function deliver(
  subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload,
) {
  const json = JSON.stringify(payload);
  const deadSubIds: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deadSubIds.push(sub.id);
        } else {
          console.error("[push] delivery failed:", err);
        }
      }
    }),
  );
  if (deadSubIds.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, deadSubIds));
  }
  return { sent, pruned: deadSubIds.length };
}
