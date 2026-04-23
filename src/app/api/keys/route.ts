import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { createHash, randomBytes } from "crypto";

function hashKey(key: string): string {
  const salt = process.env.API_KEY_SALT || "default-salt";
  return createHash("sha256").update(key + salt).digest("hex");
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const keys = await db.query.apiKeys.findMany({
    where: eq(apiKeys.userId, user.id),
    columns: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: (k, { desc }) => [desc(k.createdAt)],
  });

  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  const rawKey = `ait_${randomBytes(32).toString("hex")}`;
  const keyHash = hashKey(rawKey);
  const id = uuid();

  await db.insert(apiKeys).values({
    id,
    userId: user.id,
    keyHash,
    name,
  });

  return NextResponse.json({ id, key: rawKey, name }, { status: 201 });
}
