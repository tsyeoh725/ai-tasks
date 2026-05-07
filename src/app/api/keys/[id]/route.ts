// SL-6: revocation, not deletion. The previous DELETE physically removed
// the row, losing the audit trail. We now set revokedAt so we can answer
// "when was this key disabled?" later. authenticateApiKey treats any
// non-null revokedAt as inactive.

import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, id),
        eq(apiKeys.userId, user.id),
        isNull(apiKeys.revokedAt),
      ),
    );

  return NextResponse.json({ success: true });
}
