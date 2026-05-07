// Test a Meta Marketing API access token by hitting the /me endpoint.
import { getSessionUser, unauthorized } from "@/lib/session";
import { testConnection } from "@/lib/ad-platforms/meta/api";
import { db } from "@/db";
import { globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let token: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    token = typeof body?.token === "string" && body.token.length > 0 ? body.token : undefined;
  } catch {
    // ignore — fall through to saved token
  }

  if (!token) {
    // Fall back to the user's saved token in globalSettings.
    const saved = await db.query.globalSettings.findFirst({
      where: and(
        eq(globalSettings.userId, user.id),
        eq(globalSettings.key, "meta_access_token"),
      ),
    });
    if (saved?.value) {
      try {
        token = JSON.parse(saved.value) as string;
      } catch {
        token = saved.value;
      }
    }
  }

  if (!token) {
    return NextResponse.json(
      { ok: false, error: "No Meta access token provided or saved" },
      { status: 400 },
    );
  }

  const result = await testConnection(token);
  return NextResponse.json(result);
}
