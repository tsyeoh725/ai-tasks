import { db } from "@/db";
import { taskAttachments, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

// Get attachments for a task
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const attachments = await db.query.taskAttachments.findMany({
    where: eq(taskAttachments.taskId, id),
    with: { user: { columns: { id: true, name: true } } },
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });

  return NextResponse.json({ attachments });
}

// Upload attachment
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  // Verify task exists
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Save file (UPLOADS_DIR env in production points to /srv/ai-tasks-data/uploads)
  const uploadsRoot = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
  const uploadsDir = path.join(uploadsRoot, "tasks");
  await mkdir(uploadsDir, { recursive: true });

  const ext = path.extname(file.name);
  const fileId = uuid();
  const fileName = `${fileId}${ext}`;
  const filePath = path.join(uploadsDir, fileName);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  const attachment = {
    id: fileId,
    taskId: id,
    userId: user.id!,
    fileName: file.name,
    fileType: file.type || ext.replace(".", ""),
    filePath: `/uploads/tasks/${fileName}`,
    fileSize: file.size,
  };

  await db.insert(taskAttachments).values(attachment);

  return NextResponse.json(attachment, { status: 201 });
}

// Delete attachment
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { attachmentId } = await req.json();

  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId required" }, { status: 400 });
  }

  const attachment = await db.query.taskAttachments.findFirst({
    where: eq(taskAttachments.id, attachmentId),
  });

  if (attachment) {
    // Try to delete file. filePath is stored as "/uploads/tasks/<file>";
    // strip the leading "/uploads" and join with UPLOADS_DIR.
    try {
      const uploadsRoot = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
      const rel = attachment.filePath.replace(/^\/uploads\//, "");
      await unlink(path.join(uploadsRoot, rel));
    } catch {}

    await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
  }

  return NextResponse.json({ success: true });
}
