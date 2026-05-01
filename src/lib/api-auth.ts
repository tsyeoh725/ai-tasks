import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { NextResponse } from "next/server";

function hashKey(key: string): string {
  const salt = process.env.API_KEY_SALT || "default-salt";
  return createHash("sha256").update(key + salt).digest("hex");
}

export async function authenticateApiKey(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = hashKey(rawKey);

  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, keyHash),
  });

  if (!apiKey) return null;

  // Update last used
  await db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, apiKey.id));

  const user = await db.query.users.findFirst({
    where: eq(users.id, apiKey.userId),
    columns: { id: true, name: true, email: true },
  });

  return user;
}

export function apiUnauthorized() {
  return NextResponse.json(
    { error: "Unauthorized. Provide a valid API key via Authorization: Bearer <key>" },
    { status: 401 }
  );
}
