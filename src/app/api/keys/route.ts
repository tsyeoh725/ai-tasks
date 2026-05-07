// API key management. New keys are HMAC-SHA-256 with a per-row salt
// (SL-6). The raw key is returned exactly once at creation; it's never
// stored, never logged, and there's no way to recover it.

import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import {
  generateRawApiKey,
  generateKeySalt,
  hashKeyWithSalt,
} from "@/lib/api-auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const keys = await db.query.apiKeys.findMany({
    where: and(eq(apiKeys.userId, user.id), isNull(apiKeys.revokedAt)),
    columns: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: (k, { desc }) => [desc(k.createdAt)],
  });

  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { name?: unknown; expiresInDays?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  // Optional expiry — caller may pass 30/90/180/365 etc.; max 730 days.
  let expiresAt: Date | null = null;
  if (typeof body.expiresInDays === "number" && body.expiresInDays > 0) {
    const days = Math.min(730, Math.floor(body.expiresInDays));
    expiresAt = new Date(Date.now() + days * 86400_000);
  }

  // SL-6: HMAC + per-row salt. The raw key is never stored anywhere
  // server-side — only the HMAC. Caller must save it on receipt.
  const rawKey = generateRawApiKey();
  const salt = generateKeySalt();
  const keyHash = hashKeyWithSalt(rawKey, salt);
  const id = uuid();

  await db.insert(apiKeys).values({
    id,
    userId: user.id,
    keyHash,
    salt,
    name,
    expiresAt,
  });

  return NextResponse.json(
    { id, key: rawKey, name, expiresAt: expiresAt?.toISOString() ?? null },
    { status: 201 },
  );
}
