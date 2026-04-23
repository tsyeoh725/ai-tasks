import { db } from "@/db";
import { favorites } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// List favorites
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const items = await db.query.favorites.findMany({
    where: eq(favorites.userId, user.id!),
    orderBy: (f, { asc }) => [asc(f.position)],
  });

  return NextResponse.json({ favorites: items });
}

// Toggle favorite
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { entityType, entityId } = await req.json();

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  // Check if already favorited
  const existing = await db.query.favorites.findFirst({
    where: and(
      eq(favorites.userId, user.id!),
      eq(favorites.entityType, entityType),
      eq(favorites.entityId, entityId),
    ),
  });

  if (existing) {
    // Remove favorite
    await db.delete(favorites).where(eq(favorites.id, existing.id));
    return NextResponse.json({ favorited: false });
  } else {
    // Add favorite
    await db.insert(favorites).values({
      id: uuid(),
      userId: user.id!,
      entityType,
      entityId,
      position: 0,
    });
    return NextResponse.json({ favorited: true });
  }
}
