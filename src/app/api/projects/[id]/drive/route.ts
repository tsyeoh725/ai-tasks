import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { canAccessProject } from "@/lib/access";
import { listFolderFiles, createFolder } from "@/lib/google-drive";

// GET /api/projects/[id]/drive — list files in linked Drive folder
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!project.driveFolderId) {
    return NextResponse.json({ files: [], linked: false });
  }

  try {
    const files = await listFolderFiles(user.id, project.driveFolderId);
    return NextResponse.json({ files, linked: true, folderId: project.driveFolderId, folderName: project.driveFolderName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Drive error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/projects/[id]/drive — link or create a Drive folder
// Body: { folderId, folderName } to link existing, or { create: true } to auto-create
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  try {
    let folderId: string;
    let folderName: string;

    if (body.create) {
      const folder = await createFolder(user.id, project.name);
      folderId = folder.id!;
      folderName = folder.name!;
    } else {
      folderId = body.folderId;
      folderName = body.folderName ?? folderId;
    }

    await db.update(projects)
      .set({ driveFolderId: folderId, driveFolderName: folderName, updatedAt: new Date() })
      .where(eq(projects.id, id));

    return NextResponse.json({ folderId, folderName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Drive error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/projects/[id]/drive — unlink Drive folder
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.update(projects)
    .set({ driveFolderId: null, driveFolderName: null, updatedAt: new Date() })
    .where(eq(projects.id, id));

  return NextResponse.json({ success: true });
}
