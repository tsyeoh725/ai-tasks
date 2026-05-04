import { db } from "@/db";
import { decisionJournal } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";

// GET /api/approvals — pending approvals (guardVerdict = 'pending') scoped to brands in the active workspace.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const ws = await resolveWorkspaceForUser(user.id);
  const userBrands = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true },
  });
  const brandIds = userBrands.map((b) => b.id);
  if (brandIds.length === 0) {
    return NextResponse.json([]);
  }

  const entries = await db.query.decisionJournal.findMany({
    where: and(eq(decisionJournal.guardVerdict, "pending"), inArray(decisionJournal.brandId, brandIds)),
    with: {
      brand: { columns: { id: true, name: true } },
      ad: { columns: { id: true, name: true, metaAdId: true } },
    },
    orderBy: (d, { desc }) => [desc(d.createdAt)],
  });

  return NextResponse.json(entries);
}
