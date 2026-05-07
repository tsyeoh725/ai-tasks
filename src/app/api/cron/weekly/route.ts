import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { generateWeeklyReportForBrand } from "@/lib/marketing/learning-agent";
import { sendTelegramMessage } from "@/lib/telegram";
import { authorizeCron } from "@/lib/cron-auth";

const authorize = authorizeCron;

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
