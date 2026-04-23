import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const sub = body?.subscription;
  const endpoint = sub?.endpoint as string | undefined;
  const p256dh = sub?.keys?.p256dh as string | undefined;
  const auth = sub?.keys?.auth as string | undefined;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(pushSubscriptions.endpoint, endpoint),
  });
  if (existing) {
    if (existing.userId !== user.id) {
      await db
        .update(pushSubscriptions)
        .set({ userId: user.id!, p256dh, auth })
        .where(eq(pushSubscriptions.id, existing.id));
    }
    return NextResponse.json({ success: true, id: existing.id });
  }

  const id = uuid();
  const userAgent = req.headers.get("user-agent") ?? null;
  await db.insert(pushSubscriptions).values({
    id,
    userId: user.id!,
    endpoint,
    p256dh,
    auth,
    userAgent,
  });
  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint as string | undefined;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return NextResponse.json({ success: true });
}
