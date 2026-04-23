import { db } from "@/db";
import { accounts, calendarSyncStatus } from "@/db/schema";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");

  if (!code || !userId) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=missing_code`
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/calendar/callback`
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get the user's Google email
    let providerEmail: string | null = null;
    if (tokens.id_token) {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      providerEmail = payload?.email ?? null;
    }

    if (!providerEmail) {
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      providerEmail = data.email ?? null;
    }

    // Delete existing Google account for this user if any
    await db
      .delete(accounts)
      .where(
        and(eq(accounts.userId, userId), eq(accounts.provider, "google"))
      );

    // Store tokens in accounts table
    await db.insert(accounts).values({
      id: uuid(),
      userId,
      type: "oauth",
      provider: "google",
      providerAccountId: providerEmail ?? userId,
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date
        ? Math.floor(tokens.expiry_date / 1000)
        : null,
      tokenType: tokens.token_type ?? null,
      scope: tokens.scope ?? null,
      idToken: tokens.id_token ?? null,
      providerEmail,
    });

    // Create or update calendar sync status
    const existing = await db.query.calendarSyncStatus.findFirst({
      where: eq(calendarSyncStatus.userId, userId),
    });

    if (!existing) {
      await db.insert(calendarSyncStatus).values({
        id: uuid(),
        userId,
        status: "idle",
      });
    } else {
      await db
        .update(calendarSyncStatus)
        .set({ status: "idle", errorMessage: null })
        .where(eq(calendarSyncStatus.userId, userId));
    }

    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?calendar=connected`
    );
  } catch (error) {
    console.error("Google Calendar OAuth error:", error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/settings?error=oauth_failed`
    );
  }
}
