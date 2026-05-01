import { db } from "@/db";
import { projectClients, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { NextResponse } from "next/server";

// DELETE — unlink a client from a project (and clear clientId from this project's tasks)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; clientId: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id, clientId } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Remove junction
  await db.delete(projectClients).where(
    and(eq(projectClients.projectId, id), eq(projectClients.clientId, clientId))
  );

  // Optional: detach this client from this project's tasks (don't delete tasks)
  await db.update(tasks)
    .set({ clientId: null })
    .where(and(eq(tasks.projectId, id), eq(tasks.clientId, clientId)));

  return NextResponse.json({ ok: true });
}
