import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function getSessionUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// App-level admin allowlist via env. Comma-separated user IDs.
// Distinct from team-role admins (those are per-team and live on
// teamMembers.role). This gate protects routes that expose cross-tenant
// data (e.g. /api/admin/ai-usage, /api/diag/version).
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isAdminUser(user: { id?: string | null } | null | undefined): boolean {
  if (!user?.id) return false;
  return ADMIN_USER_IDS.includes(user.id);
}
