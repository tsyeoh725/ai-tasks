import { db } from "@/db";
import { projects } from "@/db/schema";
import { desc } from "drizzle-orm";
import { authenticateApiKey, apiUnauthorized } from "@/lib/api-auth";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const result = await db.query.projects.findMany({
    orderBy: [desc(projects.updatedAt)],
  });

  return NextResponse.json({ data: result });
}

export async function POST(req: Request) {
  const user = await authenticateApiKey(req);
  if (!user) return apiUnauthorized();

  const { name, description, color, team_id } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(projects).values({
    id,
    name,
    description: description || null,
    color: color || "#6366f1",
    teamId: team_id || null,
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  const project = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.id, id),
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
