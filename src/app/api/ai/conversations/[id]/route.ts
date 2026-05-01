import { db } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const conv = await db.query.aiConversations.findFirst({
    where: and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id!)),
  });
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await db.query.aiMessages.findMany({
    where: eq(aiMessages.conversationId, id),
    orderBy: [asc(aiMessages.createdAt)],
  });

  return NextResponse.json({
    conversation: conv,
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolName: m.toolName,
      toolArgs: m.toolArgs,
      toolResult: m.toolResult,
      createdAt: m.createdAt,
    })),
  });
}
