// SL-6: API key authentication.
//
// New keys (post-0008) are HMAC-SHA-256 with a per-row salt. Legacy keys
// (salt=NULL) are still verified with the original SHA-256 + global
// API_KEY_SALT scheme so we don't break existing integrations during the
// rollover. Crash-fast on missing API_KEY_SALT — the previous "default-salt"
// fallback meant a stolen DB allowed offline brute force at GPU speeds with
// the salt baked into the codebase.
//
// SL-1: returns the user only if the key is active (not revoked, not
// expired) — so a leaked key can be retired without deleting the audit row.

import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual, randomBytes } from "crypto";
import { NextResponse } from "next/server";

function getRequiredSalt(): string {
  const salt = process.env.API_KEY_SALT;
  if (!salt) {
    throw new Error(
      "API_KEY_SALT must be set. The previous 'default-salt' fallback was a " +
        "DB-leak-to-credential-leak pipeline; refusing to operate without it.",
    );
  }
  return salt;
}

/** Hash a freshly minted key with a per-row salt. Use for new key insertion. */
export function hashKeyWithSalt(rawKey: string, perRowSalt: string): string {
  // HMAC binds the row salt to a server-side master secret; rotating the
  // master secret invalidates all keys, rotating just the row's salt
  // invalidates one.
  const master = getRequiredSalt();
  return createHmac("sha256", master).update(rawKey + perRowSalt).digest("hex");
}

/** Generate a per-key salt — 16 random bytes, base64url encoded. */
export function generateKeySalt(): string {
  return randomBytes(16).toString("base64url");
}

/** Legacy SHA-256 hashing for keys created before the 0008 migration. */
function legacyHashKey(rawKey: string): string {
  const salt = getRequiredSalt();
  return createHash("sha256").update(rawKey + salt).digest("hex");
}

/** Generate a fresh API key string (caller-facing). */
export function generateRawApiKey(): string {
  return `ait_${randomBytes(32).toString("base64url")}`;
}

export async function authenticateApiKey(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) return null;

  // Look up by the legacy hash first — it's the cheap path for the bulk of
  // existing rows. If that misses, we don't have a way to lookup-by-HMAC
  // without a salt, so we scan the user's salted rows. For an internal app
  // with a small key count this is fine; for high-throughput, store an
  // index on a non-secret prefix and look up by that.
  const legacyHash = legacyHashKey(rawKey);
  let apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.keyHash, legacyHash),
  });

  if (!apiKey) {
    // HMAC path: scan rows with a per-row salt and timing-safe-compare.
    // The set is bounded per user so this stays cheap.
    const salted = await db.query.apiKeys.findMany({
      where: (k, { isNotNull }) => isNotNull(k.salt),
    });
    for (const row of salted) {
      if (!row.salt) continue;
      const candidate = hashKeyWithSalt(rawKey, row.salt);
      const a = Buffer.from(candidate);
      const b = Buffer.from(row.keyHash);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        apiKey = row;
        break;
      }
    }
  }

  if (!apiKey) return null;

  // SL-1: enforce lifecycle.
  if (apiKey.revokedAt) return null;
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) return null;

  // Update last used (best-effort — doesn't block auth).
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
