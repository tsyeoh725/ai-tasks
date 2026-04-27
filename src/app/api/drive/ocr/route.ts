import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { extractTextFromFile } from "@/lib/google-drive";

// POST /api/drive/ocr  { fileId, mimeType }
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { fileId, mimeType } = await req.json();
  if (!fileId || !mimeType) {
    return NextResponse.json({ error: "fileId and mimeType are required" }, { status: 400 });
  }

  try {
    const text = await extractTextFromFile(user.id, fileId, mimeType);
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OCR error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
