import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Guard: Google credentials must be configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Google OAuth credentials are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env.local file. " +
          "Create credentials at https://console.cloud.google.com/apis/credentials and add " +
          `http://localhost:3000/api/calendar/callback as an authorized redirect URI.`,
      },
      { status: 503 }
    );
  }

  const redirectUri = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/calendar/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
    state: user.id,
    redirect_uri: redirectUri,
  });

  return NextResponse.json({ url: authUrl });
}
