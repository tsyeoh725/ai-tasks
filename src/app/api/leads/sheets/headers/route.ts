import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  const sheetId = extractSheetId(url);
  if (!sheetId) {
    return NextResponse.json(
      { error: "Invalid Google Sheets URL. Copy the full URL from your browser." },
      { status: 400 }
    );
  }

  // Extract optional gid (sheet tab) from URL
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  // Build CSV export URL — works for publicly shared sheets
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  let csv: string;
  try {
    const res = await fetch(csvUrl, {
      headers: { "User-Agent": "AI-Tasks/1.0" },
      redirect: "follow",
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "Sheet is private. Share it as 'Anyone with the link can view' and try again." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `Could not read sheet (HTTP ${res.status}). Make sure sharing is set to 'Anyone with the link'.` },
        { status: res.status }
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return NextResponse.json(
        { error: "Sheet is not publicly accessible. Set sharing to 'Anyone with the link can view'." },
        { status: 403 }
      );
    }

    csv = await res.text();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Network error: ${msg}` }, { status: 500 });
  }

  // Parse first row as headers
  const firstLine = csv.split("\n")[0] || "";
  // Handle quoted CSV fields
  const headers = firstLine.split(",").map((h) =>
    h.trim().replace(/^["']|["']$/g, "").trim()
  ).filter(Boolean);

  if (headers.length === 0) {
    return NextResponse.json({ error: "Sheet appears to be empty." }, { status: 400 });
  }

  return NextResponse.json({ headers, sheetId, gid });
}
