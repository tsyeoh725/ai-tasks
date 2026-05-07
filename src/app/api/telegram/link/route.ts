import { db } from "@/db";
import { telegramLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { generateLinkCode } from "@/lib/telegram";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const link = await db.query.telegramLinks.findFirst({
    where: eq(telegramLinks.userId, user.id),
  });

  return NextResponse.json({
    linked: !!link,
    username: link?.telegramUsername || null,
    notifyDigest: link?.notifyDigest ?? true,
    notifyAssignments: link?.notifyAssignments ?? true,
    notifyOverdue: link?.notifyOverdue ?? true,
    digestTime: link?.digestTime || "09:00",
  });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const code = await generateLinkCode(user.id);

  return NextResponse.json({
    code,
    botUsername: process.env.TELEGRAM_BOT_USERNAME || "your_bot",
    instructions: `Send /start ${code} to the bot on Telegram`,
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  await db.delete(telegramLinks).where(eq(telegramLinks.userId, user.id));
  return NextResponse.json({ success: true });
}
