import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const profile = await db.query.users.findFirst({
    where: eq(users.id, user.id!),
    columns: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
  });

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, avatarUrl } = await req.json();

  const updates: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof avatarUrl === "string") updates.avatarUrl = avatarUrl || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, user.id!));

  const updated = await db.query.users.findFirst({
    where: eq(users.id, user.id!),
    columns: { id: true, name: true, email: true, avatarUrl: true, createdAt: true },
  });

  return NextResponse.json(updated);
}
