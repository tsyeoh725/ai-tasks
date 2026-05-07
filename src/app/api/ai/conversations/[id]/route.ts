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

// F-45: rename a conversation. Auto-titling from the first message works
// fine but produces cryptic substrings (the first 80 chars of the prompt),
// and users have no way to fix that. The endpoint is scoped to the
// conversation's owner — same multi-tenant guard as GET (SL-1).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const rawTitle = typeof body.title === "string" ? body.title : "";
  // Trim, cap length, and strip script tags — same defensive shape as
  // /api/projects POST (F-72). Conversation titles render in the sidebar
  // list, never as innerHTML, but this matches AGENTS.md SL-12 at the
  // input layer.
  const cleaned = rawTitle
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<\/?script\b[^>]*>/gi, "")
    .trim()
    .slice(0, 200);
  if (!cleaned) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  // Owner check — return 404 (not 403) so we don't reveal that an id exists
  // belonging to another user.
  const existing = await db.query.aiConversations.findFirst({
    where: and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id!)),
    columns: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await db
    .update(aiConversations)
    .set({ title: cleaned, updatedAt: new Date() })
    .where(eq(aiConversations.id, id))
    .returning();

  return NextResponse.json({ conversation: updated[0] });
}

// Allow deleting a conversation while we're here. Cascade clears messages.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const existing = await db.query.aiConversations.findFirst({
    where: and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id!)),
    columns: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(aiConversations).where(eq(aiConversations.id, id));
  return NextResponse.json({ ok: true });
}
