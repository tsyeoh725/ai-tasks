import { NextResponse } from "next/server";
import { getSessionUser, unauthorized } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const result = await sendPushToUser(user.id!, {
    title: "AI Tasks",
    body: "Push notifications are working \u{1F680}",
    url: "/inbox",
    tag: "push-test",
  });
  return NextResponse.json({ success: true, ...result });
}
