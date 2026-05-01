import { db } from "@/db";
import { documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { renderDocxToHtml } from "@/lib/document-parser";

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

  if (doc.fileType === "docx" || doc.fileType === "doc") {
    try {
      const html = await renderDocxToHtml(doc.filePath);
      return NextResponse.json({ html, type: "html" });
    } catch {
      return NextResponse.json({ text: doc.extractedText || "", type: "text" });
    }
  }

  return NextResponse.json({ text: doc.extractedText || "", type: "text" });
}
