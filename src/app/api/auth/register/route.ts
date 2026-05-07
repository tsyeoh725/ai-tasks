// SL-5: registration is opt-in (ENABLE_REGISTRATION env), optionally domain-
// allowlisted, and IP-rate-limited. The previous endpoint was wide open —
// anyone with the URL could create an account, then drive-by combine that
// with v1 API access (CR-01) to read/write the entire DB.
//
// Operator setup:
//   ENABLE_REGISTRATION=true                       # required to enable signup
//   REGISTRATION_DOMAIN_ALLOWLIST=acme.com,foo.io  # optional comma list
//
// If unset, /register returns 403 immediately. Existing users continue to
// log in via NextAuth credentials provider (handled elsewhere).

import { db } from "@/db";
import { users } from "@/db/schema";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const REGISTRATION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const REGISTRATION_MAX_PER_WINDOW = 5;          // 5 registrations per IP per hour

function isEmailDomainAllowed(email: string): boolean {
  const allowlist = (process.env.REGISTRATION_DOMAIN_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return true; // no allowlist configured = all domains OK
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return allowlist.some((d) => domain === d.toLowerCase());
}

export async function POST(req: Request) {
  // SL-5: gate the entire endpoint behind env opt-in.
  if (process.env.ENABLE_REGISTRATION !== "true") {
    return NextResponse.json(
      { error: "Registration is closed. Contact an administrator for an invite." },
      { status: 403 },
    );
  }

  // SL-5: per-IP rate limit. Burst of 5 / hour per IP makes drive-by signup
  // impractical without changing IPs constantly.
  const ip = getClientIp(req);
  const rl = rateLimit(`register:${ip}`, REGISTRATION_WINDOW_MS, REGISTRATION_MAX_PER_WINDOW);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = (await req.json()) as { name?: unknown; email?: unknown; password?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    if (!isEmailDomainAllowed(email)) {
      return NextResponse.json(
        { error: "This email domain is not allowed for self-signup." },
        { status: 403 },
      );
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const id = uuid();

    await db.insert(users).values({
      id,
      name,
      email,
      passwordHash,
    });

    return NextResponse.json({ id, name, email }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
