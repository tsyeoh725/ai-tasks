import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/calendar/callback`
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: user.id,
  });

  return NextResponse.json({ url: authUrl });
}
