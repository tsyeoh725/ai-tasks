import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { listDrives, listFolderFiles } from "@/lib/google-drive";

// GET /api/drive?folderId=xxx  — list files in a folder (or drives if no folderId)
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get("folderId");

  try {
    if (folderId) {
      const files = await listFolderFiles(user.id, folderId);
      return NextResponse.json({ files });
    } else {
      const drives = await listDrives(user.id);
      return NextResponse.json({ drives });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Drive error";
    if (message.includes("No Google account")) {
      return NextResponse.json({ error: "Google account not linked" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
