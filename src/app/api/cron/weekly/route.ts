import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { generateWeeklyReportForBrand } from "@/lib/marketing/learning-agent";
import { sendTelegramMessage } from "@/lib/telegram";

async function authorize(req: Request): Promise<
  | { userId: string; cron: false }
  | { userId: null; cron: true }
  | { error: NextResponse }
> {
  const cronSecretHeader = req.headers.get("x-cron-secret");
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && cronSecretHeader === envSecret) {
    return { userId: null, cron: true };
  }
  const user = await getSessionUser();
  if (user) return { userId: user.id, cron: false };
  return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
}

// POST /api/cron/weekly
export async function POST(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;

  const targetBrands = auth.cron
    ? await db.query.brands.findMany({ where: eq(brands.isActive, true) })
    : await db.query.brands.findMany({ where: eq(brands.userId, auth.userId) });

  if (targetBrands.length === 0) {
    return NextResponse.json({ message: "No brands to report on", reports: [] });
  }

  const reports: Array<{
    brandId: string;
    brandName: string;
    generated: boolean;
    summary?: string | null;
    error?: string;
  }> = [];

  for (const brand of targetBrands) {
    try {
      const summary = await generateWeeklyReportForBrand(brand.id);
      reports.push({
        brandId: brand.id,
        brandName: brand.name,
        generated: !!summary,
        summary,
      });

      if (summary) {
        try {
          await sendTelegramMessage(
            brand.userId,
            `Weekly report — ${brand.name}\n\n${summary}`,
          );
        } catch {
          // swallow telegram errors — do not fail the report run
        }
      }
    } catch (err) {
      reports.push({
        brandId: brand.id,
        brandName: brand.name,
        generated: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ message: "Weekly reports complete", reports });
}
