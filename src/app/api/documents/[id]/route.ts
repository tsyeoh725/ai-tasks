// SL-1: ownership-gated read + delete (already correct in the prior version).
// SL-3: filename sanitized for Content-Disposition; resolved DB-stored path
//       is asserted to stay under UPLOADS_DIR before fs.unlink.
// SL-12: serve as `attachment` not `inline` — never trust an uploaded file
//        to be safe to render in the browser tab.

import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { getUploadsRoot, assertSafePath, attachmentDisposition } from "@/lib/uploads";
import { NextResponse } from "next/server";
import fs from "fs/promises";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canAccessProject(doc.projectId, user.id!))) return forbidden();

  let fileBytes: ArrayBuffer;
  try {
    const buf = await fs.readFile(doc.filePath);
    fileBytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const contentTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  return new Response(fileBytes as BodyInit, {
    headers: {
      "Content-Type": contentTypes[doc.fileType] || "application/octet-stream",
      // SL-12: attachment not inline; sanitized filename so CRLF in stored
      // filename can't perform header injection / response splitting.
      "Content-Disposition": attachmentDisposition(doc.filename),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });

  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await canAccessProject(doc.projectId, user.id!))) return forbidden();

  // SL-3: assert the stored path stays under UPLOADS_DIR before unlinking.
  // Defense against a tampered DB row (or a future bug) that sets filePath
  // to something outside the uploads tree.
  try {
    const root = getUploadsRoot();
    assertSafePath(doc.filePath, root);
    await fs.unlink(doc.filePath);
  } catch {
    // Non-fatal: file may be missing, or a legacy upload stored under
    // process.cwd()/uploads pre-fix. Either way, swallow and proceed to
    // the DB row deletion.
  }
  await db.delete(documents).where(eq(documents.id, id));

  return NextResponse.json({ success: true });
}
