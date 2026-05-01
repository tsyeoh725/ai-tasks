import { db } from "@/db";
import { projectClients, tasks } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessProject } from "@/lib/access";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// GET — list all clients linked to this project (junction + derived from tasks)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load explicit junction links
  const linked = await db.query.projectClients.findMany({
    where: eq(projectClients.projectId, id),
    with: {
      client: {
        columns: { id: true, name: true, logoUrl: true, brandColor: true, status: true, services: true },
      },
    },
  });

  // Per-client task counts
  const taskCounts = await db
    .select({ clientId: tasks.clientId, c: count() })
    .from(tasks)
    .where(eq(tasks.projectId, id))
    .groupBy(tasks.clientId);

  const countMap = new Map(taskCounts.map((r) => [r.clientId, r.c]));

  return NextResponse.json({
    clients: linked
      .filter((l) => l.client !== null)
      .map((l) => ({
        ...l.client!,
        _taskCount: countMap.get(l.client!.id) ?? 0,
      })),
  });
}

// POST — link a client to this project
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessProject(id, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { clientId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  if (!(await canAccessClient(body.clientId, user.id!))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Skip if already linked
  const existing = await db.query.projectClients.findFirst({
    where: and(eq(projectClients.projectId, id), eq(projectClients.clientId, body.clientId)),
  });
  if (existing) return NextResponse.json({ ok: true, alreadyLinked: true });

  await db.insert(projectClients).values({
    id: uuid(),
    projectId: id,
    clientId: body.clientId,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
