import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
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

  // Validate file type
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  const allowedTypes = ["pdf", "doc", "docx", "ppt", "pptx"];
  if (!allowedTypes.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type: .${ext}` }, { status: 400 });
  }

  // Save file to uploads directory (UPLOADS_DIR env in production points
  // to /srv/ai-tasks-data/uploads — outside the deploy dir).
  const id = uuid();
  const uploadsRoot = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
  const uploadDir = path.join(uploadsRoot, projectId);
  await mkdir(uploadDir, { recursive: true });

  const fileName = `${id}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  // Extract text for AI context
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
