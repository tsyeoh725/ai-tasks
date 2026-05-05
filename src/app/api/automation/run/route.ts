import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { canAccessBrand } from "@/lib/brand-access";
import { startJob } from "@/lib/jobs";
import { runAutomationCycleForBrand } from "@/lib/marketing/automation-runner";

// POST /api/automation/run  { brandId }
// Manually triggers a sync→audit cycle for one brand. Returns 202 + jobId
// so the operator can navigate away while the cycle runs in the background;
// progress shows up in the JobStatusBadge.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { brandId?: string };
  if (!body.brandId) {
    return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  }

  const brand = await db.query.brands.findFirst({ where: eq(brands.id, body.brandId) });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!(await canAccessBrand(brand, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const handle = await startJob({
    userId: user.id,
    type: "monitor_audit",
    label: `Automation cycle — ${brand.name}`,
    payload: { brandId: brand.id, trigger: "manual" },
    work: () => runAutomationCycleForBrand(brand.id, "manual"),
  });

  return NextResponse.json({ queued: true, jobId: handle.jobId }, { status: 202 });
}
