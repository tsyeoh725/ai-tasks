import { db } from "@/db";
import { agentMemory, brands } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { addPreference } from "@/lib/marketing/learning-agent";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere, canAccessBrand } from "@/lib/brand-access";

// GET /api/agent-memory?brandId=
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");

  const ws = await resolveWorkspaceForUser(user.id);
  const userBrands = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true, name: true },
  });
  const brandIds = userBrands.map((b) => b.id);

  if (brandIds.length === 0) {
    return NextResponse.json({ memories: [], brands: [] });
  }

  if (brandId && brandId !== "all" && !brandIds.includes(brandId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Memories are shared across all members for team brands. The userId column
  // tracks who created the entry but does not restrict reads.
  const whereCondition =
    brandId && brandId !== "all"
      ? eq(agentMemory.brandId, brandId)
      : inArray(agentMemory.brandId, brandIds);

  const memories = await db.query.agentMemory.findMany({
    where: whereCondition,
    with: { brand: { columns: { id: true, name: true } } },
    orderBy: (m, { desc }) => [desc(m.createdAt)],
  });

  return NextResponse.json({ memories, brands: userBrands });
}

// POST /api/agent-memory  { brandId, content }
// Stores a user-provided preference via learning-agent.addPreference.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { brandId?: string; content?: string };
  const { brandId, content } = body;

  if (!brandId || !content) {
    return NextResponse.json({ error: "brandId and content are required" }, { status: 400 });
  }

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!(await canAccessBrand(brand, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await addPreference(brandId, user.id, content);

  return NextResponse.json({ success: true });
}
