import { db } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const conversations = await db.query.aiConversations.findMany({
    where: eq(aiConversations.userId, user.id!),
    orderBy: [desc(aiConversations.updatedAt)],
    limit: 50,
  });

  return NextResponse.json({ conversations });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { conversationId } = await req.json();
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // Verify ownership
  const conv = await db.query.aiConversations.findFirst({
    where: and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, user.id!)),
  });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete messages first (cascade should handle, but be explicit)
  await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
  await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));

  return NextResponse.json({ success: true });
}
