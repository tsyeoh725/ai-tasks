import { db } from "@/db";
import { templates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const category = searchParams.get("category");

  const conditions = [];
  if (type) {
    conditions.push(eq(templates.type, type as "project" | "task"));
  }
  if (category) {
    conditions.push(eq(templates.category, category));
  }

  const result = await db.query.templates.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      createdBy: {
        columns: { id: true, name: true },
      },
    },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  return NextResponse.json({ templates: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, description, type, content, category, isPublic, teamId } =
    await req.json();

  if (!name || !type || !content) {
    return NextResponse.json(
      { error: "name, type, and content are required" },
      { status: 400 }
    );
  }

  const id = uuid();
  const now = new Date();

  await db.insert(templates).values({
    id,
    name,
    description: description || null,
    type,
    content: typeof content === "string" ? content : JSON.stringify(content),
    category: category || null,
    isPublic: isPublic ?? false,
    createdById: user.id,
    teamId: teamId || null,
    createdAt: now,
    updatedAt: now,
  });

  const template = await db.query.templates.findFirst({
    where: eq(templates.id, id),
    with: {
      createdBy: {
        columns: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
