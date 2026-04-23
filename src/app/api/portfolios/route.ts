import { db } from "@/db";
import { portfolios, portfolioProjects, projects, tasks } from "@/db/schema";
import { eq, and, inArray, count } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const result = await db.query.portfolios.findMany({
    where: eq(portfolios.ownerId, user.id),
    with: {
      projects: {
        with: {
          project: true,
        },
      },
    },
    orderBy: (p, { desc }) => [desc(p.updatedAt)],
  });

  return NextResponse.json({ portfolios: result });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, description, color, teamId } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const id = uuid();
  const now = new Date();

  await db.insert(portfolios).values({
    id,
    name,
    description: description || null,
    color: color || "#6366f1",
    ownerId: user.id,
    teamId: teamId || null,
    createdAt: now,
    updatedAt: now,
  });

  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.id, id),
    with: {
      projects: {
        with: {
          project: true,
        },
      },
    },
  });

  return NextResponse.json(portfolio, { status: 201 });
}
