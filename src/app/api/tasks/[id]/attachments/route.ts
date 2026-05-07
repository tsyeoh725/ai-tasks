// SL-1: every operation gates via canAccessProject(task.projectId, user.id).
// SL-3: writes go under $UPLOADS_DIR/task-attachments (persistent across
//       redeploys); stored filePath is relative to that root; DELETE
//       resolves the absolute path and asserts containment.
// SL-4: MIME allowlist + 25 MB size cap; async I/O.
//
// Previously this route wrote to process.cwd()/src/uploads/tasks which
// lives inside the standalone runtime — every redeploy nuked all stored
// attachments silently.

import { db } from "@/db";
import { taskAttachments, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import {
  getUploadsRoot,
  assertSafePath,
  ATTACHMENT_MIME_ALLOWLIST,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/uploads";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const ATTACHMENT_SUBDIR = "task-attachments";

// Get attachments for a task
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  // SL-1: scope by task ownership before listing.
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!(await canAccessProject(task.projectId, user.id!))) return forbidden();

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
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  // SL-1: project access gate before any disk write.
  if (!(await canAccessProject(task.projectId, user.id!))) return forbidden();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  // SL-4: MIME + size enforcement.
  if (!ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  // SL-3: persistent root + safe path. Stored filePath is the relative
  // path under UPLOADS_DIR so DELETE can re-resolve safely.
  const root = getUploadsRoot();
  const uploadsDir = path.join(root, ATTACHMENT_SUBDIR);
  await mkdir(uploadsDir, { recursive: true });

  const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const fileId = uuid();
  const fileName = `${fileId}${ext}`;
  const absolutePath = path.join(uploadsDir, fileName);
  assertSafePath(absolutePath, root);

  const bytes = await file.arrayBuffer();
  await writeFile(absolutePath, Buffer.from(bytes));

  const relativePath = path.posix.join(ATTACHMENT_SUBDIR, fileName);
  const attachment = {
    id: fileId,
    taskId: id,
    userId: user.id!,
    fileName: file.name,
    fileType: file.type || ext.replace(".", ""),
    filePath: relativePath,
    fileSize: file.size,
  };

  await db.insert(taskAttachments).values(attachment);

  return NextResponse.json(attachment, { status: 201 });
}

// Delete attachment
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { attachmentId } = await req.json();
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId required" }, { status: 400 });
  }

  const attachment = await db.query.taskAttachments.findFirst({
    where: eq(taskAttachments.id, attachmentId),
  });
  if (!attachment) {
    return NextResponse.json({ success: true });
  }

  // SL-1: gate via the parent task's project access. Without this, any
  // logged-in user could delete attachments by guessing IDs.
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, attachment.taskId) });
  if (!task) {
    // Orphan attachment row — safe to clean up regardless.
    await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));
    return NextResponse.json({ success: true });
  }
  if (!(await canAccessProject(task.projectId, user.id!))) return forbidden();

  // SL-3: DELETE without containment assertion would let a tampered
  // filePath value (or a stored absolute path from a legacy row) coerce
  // unlink into removing arbitrary files. Resolve, assert, unlink.
  try {
    const root = getUploadsRoot();
    // Treat stored filePath as relative to the uploads root. Old rows
    // that stored absolute paths or "/uploads/tasks/..." prefixes will
    // fail the safety check and silently fall through — those files are
    // already gone (the old src/uploads is wiped on every deploy).
    const candidate = path.resolve(root, attachment.filePath);
    assertSafePath(candidate, root);
    await unlink(candidate);
  } catch {
    // Swallow — file may be missing, legacy path, or path-escape attempt.
    // The DB row deletion below proceeds either way.
  }

  await db.delete(taskAttachments).where(eq(taskAttachments.id, attachmentId));

  return NextResponse.json({ success: true });
}
