import { db } from "@/db";
import { taskComments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { commentId } = await params;

  const comment = await db.query.taskComments.findFirst({
    where: eq(taskComments.id, commentId),
    columns: { id: true, authorId: true },
  });

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  if (comment.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(taskComments).where(
    and(eq(taskComments.id, commentId), eq(taskComments.authorId, user.id!)),
  );

  return NextResponse.json({ success: true });
}
