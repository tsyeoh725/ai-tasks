import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { listFolderFiles, createFolder } from "@/lib/google-drive";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!client.driveFolderId) {
    return NextResponse.json({ files: [], linked: false });
  }

  try {
    const files = await listFolderFiles(user.id, client.driveFolderId);
    return NextResponse.json({ files, linked: true, folderId: client.driveFolderId, folderName: client.driveFolderName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Drive error";
    if (message.includes("No Google account")) {
      return NextResponse.json({ error: "Google account not linked" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: link existing folder { folderId, folderName } or auto-create { create: true }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  try {
    let folderId: string;
    let folderName: string;

    if (body.create) {
      const folder = await createFolder(user.id, client.name);
      folderId = folder.id!;
      folderName = folder.name!;
    } else {
      folderId = body.folderId;
      folderName = body.folderName ?? folderId;
    }

    await db.update(clients)
      .set({ driveFolderId: folderId, driveFolderName: folderName, updatedAt: new Date() })
      .where(eq(clients.id, id));

    return NextResponse.json({ folderId, folderName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Drive error";
    if (message.includes("No Google account")) {
      return NextResponse.json({ error: "Google account not linked" }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  await db.update(clients)
    .set({ driveFolderId: null, driveFolderName: null, updatedAt: new Date() })
    .where(eq(clients.id, id));

  return NextResponse.json({ success: true });
}
