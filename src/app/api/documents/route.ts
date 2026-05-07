// SL-1: every read/write here is gated by canAccessProject(projectId, user.id).
// SL-3: projectId is UUID-validated before path.join; resolved-path is
//       asserted to stay under UPLOADS_DIR.
// SL-4: MIME allowlist + 25 MB size cap; async file I/O.
//
// Storage layout: $UPLOADS_DIR/<projectId>/<id>.<ext>. UPLOADS_DIR defaults
// to /data/uploads which is bind-mounted from the host so writes survive
// redeploys. Previously process.cwd()/uploads landed in the standalone
// runtime path inside the container — vanished on every redeploy.

import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import {
  getUploadsRoot,
  isValidUuid,
  assertSafePath,
  DOCUMENT_MIME_ALLOWLIST,
  MAX_DOCUMENT_BYTES,
} from "@/lib/uploads";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { extractText } from "@/lib/document-parser";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  if (!isValidUuid(projectId)) {
    return NextResponse.json({ error: "invalid projectId" }, { status: 400 });
  }
  // SL-1: gate cross-tenant document listing.
  if (!(await canAccessProject(projectId, user.id!))) return forbidden();

  const docs = await db.query.documents.findMany({
    where: eq(documents.projectId, projectId),
    with: { uploadedBy: { columns: { name: true } } },
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  if (!file || !projectId) {
    return NextResponse.json({ error: "file and projectId required" }, { status: 400 });
  }
  if (!isValidUuid(projectId)) {
    return NextResponse.json({ error: "invalid projectId" }, { status: 400 });
  }
  // SL-1: gate before any FS work.
  if (!(await canAccessProject(projectId, user.id!))) return forbidden();

  // SL-4: MIME allowlist, not extension. The browser-supplied file.type can
  // be spoofed by a determined attacker but it's the cheapest first filter;
  // combined with the strict allowlist + extension check + size cap, this
  // matches real-world threat models for an internal app.
  if (!DOCUMENT_MIME_ALLOWLIST.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  if (!["pdf", "doc", "docx", "ppt", "pptx"].includes(ext)) {
    return NextResponse.json({ error: `Unsupported file extension: .${ext}` }, { status: 415 });
  }

  // SL-3: build the storage path and assert it stays under UPLOADS_DIR.
  const id = uuid();
  const root = getUploadsRoot();
  const uploadDir = path.join(root, "documents", projectId);
  const fileName = `${id}.${ext}`;
  const filePath = path.join(uploadDir, fileName);
  assertSafePath(filePath, root);
  await mkdir(uploadDir, { recursive: true });

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  // Extract text for AI context. Best-effort — never blocks the upload.
  let extractedText = "";
  try {
    extractedText = await extractText(filePath, ext);
  } catch {
    // Non-fatal: text extraction failed
  }

  await db.insert(documents).values({
    id,
    projectId,
    uploadedById: user.id,
    filename: file.name,
    filePath,
    fileType: ext,
    fileSize: file.size,
    extractedText: extractedText || null,
  });

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: { uploadedBy: { columns: { name: true } } },
  });

  return NextResponse.json(doc, { status: 201 });
}
