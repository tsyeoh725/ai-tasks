import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
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

  if (!(await canAccessProject(doc.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      "Content-Disposition": `inline; filename="${doc.filename}"`,
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

  if (!(await canAccessProject(doc.projectId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try { await fs.unlink(doc.filePath); } catch {}
  await db.delete(documents).where(eq(documents.id, id));

  return NextResponse.json({ success: true });
}
