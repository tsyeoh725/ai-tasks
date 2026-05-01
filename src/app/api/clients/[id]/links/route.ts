import { db } from "@/db";
import { clientLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { canAccessClient } from "@/lib/client-access";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const links = await db.query.clientLinks.findMany({
    where: eq(clientLinks.clientId, id),
    orderBy: (l, { asc }) => [asc(l.sortOrder), asc(l.createdAt)],
  });
  return NextResponse.json({ links });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await canAccessClient(id, user.id!))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const platform = (body.platform as string) || "custom";
  const label = (body.label as string)?.trim();
  const url = (body.url as string)?.trim();
  if (!label || !url) return NextResponse.json({ error: "label and url required" }, { status: 400 });

  const linkId = uuid();
  await db.insert(clientLinks).values({
    id: linkId,
    clientId: id,
    platform,
    label,
    url,
    sortOrder: Number(body.sortOrder) || 0,
    createdAt: new Date(),
  });

  const created = await db.query.clientLinks.findFirst({ where: eq(clientLinks.id, linkId) });
  return NextResponse.json(created, { status: 201 });
}
