// Aggregations over `ai_usage_log` for the admin spend view at
// /settings/ai-usage. All sums are computed in SQLite — no per-row data
// crosses the wire, just the rolled-up shape the UI renders.
import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiUsageLog, users } from "@/db/schema";
import { and, desc, eq, gte, sql, or } from "drizzle-orm";
import { getSessionUser, unauthorized, forbidden, isAdminUser } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  // SL-1: admin-gate the cross-tenant view. byUser includes per-user spend +
  // emails for the top 20; recent errors can leak prompt fragments. Without
  // this gate any logged-in user (including drive-by signups) sees it all.
  if (!isAdminUser(user)) return forbidden();

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(searchParams.get("days") || 7)));
  const since = new Date(Date.now() - days * 86400_000);

  const sinceCondition = gte(aiUsageLog.createdAt, since);

  // Headline rolls — totals split by feature (jarvis / audit / health_check).
  const totalsByFeature = await db
    .select({
      feature: aiUsageLog.feature,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLog.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLog.outputTokens}), 0)`,
      cacheCreationTokens: sql<number>`coalesce(sum(${aiUsageLog.cacheCreationTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${aiUsageLog.cacheReadTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageLog.costUsd}), 0)`,
    })
    .from(aiUsageLog)
    .where(sinceCondition)
    .groupBy(aiUsageLog.feature);

  // Per call site — answers "what spent the most".
  const byCallSite = await db
    .select({
      callSite: aiUsageLog.callSite,
      feature: aiUsageLog.feature,
      provider: aiUsageLog.provider,
      model: aiUsageLog.model,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLog.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLog.outputTokens}), 0)`,
      cacheReadTokens: sql<number>`coalesce(sum(${aiUsageLog.cacheReadTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageLog.costUsd}), 0)`,
    })
    .from(aiUsageLog)
    .where(sinceCondition)
    .groupBy(aiUsageLog.callSite, aiUsageLog.feature, aiUsageLog.provider, aiUsageLog.model)
    .orderBy(desc(sql`sum(${aiUsageLog.costUsd})`))
    .limit(50);

  // Per user — only meaningful for Jarvis (audit calls don't always carry a userId).
  const byUser = await db
    .select({
      userId: aiUsageLog.userId,
      userName: users.name,
      userEmail: users.email,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLog.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLog.outputTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageLog.costUsd}), 0)`,
    })
    .from(aiUsageLog)
    .leftJoin(users, eq(users.id, aiUsageLog.userId))
    .where(sinceCondition)
    .groupBy(aiUsageLog.userId, users.name, users.email)
    .orderBy(desc(sql`sum(${aiUsageLog.costUsd})`))
    .limit(20);

  // Per model — surfaces if a single model is dominating (e.g. yesterday's
  // gpt-4o-mini-on-Anthropic bug would show up as a row of 100% errors).
  const byModel = await db
    .select({
      model: aiUsageLog.model,
      provider: aiUsageLog.provider,
      calls: sql<number>`count(*)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageLog.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageLog.outputTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageLog.costUsd}), 0)`,
      successCount: sql<number>`sum(case when status = 'success' then 1 else 0 end)`,
    })
    .from(aiUsageLog)
    .where(sinceCondition)
    .groupBy(aiUsageLog.model, aiUsageLog.provider)
    .orderBy(desc(sql`sum(${aiUsageLog.costUsd})`));

  // Recent errors / rate limits — most actionable section. Last 50 within
  // the window so a misconfig spike (yesterday's gpt-4o-mini-on-Anthropic
  // bug) is impossible to miss.
  const recentErrors = await db
    .select({
      id: aiUsageLog.id,
      feature: aiUsageLog.feature,
      callSite: aiUsageLog.callSite,
      provider: aiUsageLog.provider,
      model: aiUsageLog.model,
      status: aiUsageLog.status,
      errorMessage: aiUsageLog.errorMessage,
      createdAt: aiUsageLog.createdAt,
    })
    .from(aiUsageLog)
    .where(and(sinceCondition, or(eq(aiUsageLog.status, "error"), eq(aiUsageLog.status, "rate_limited"))!))
    .orderBy(desc(aiUsageLog.createdAt))
    .limit(50);

  // Daily cost spark (helps spot a sudden spike).
  const daily = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${aiUsageLog.createdAt}, 'unixepoch')`,
      jarvisCost: sql<number>`coalesce(sum(case when feature = 'jarvis' then cost_usd else 0 end), 0)`,
      auditCost: sql<number>`coalesce(sum(case when feature = 'audit' then cost_usd else 0 end), 0)`,
    })
    .from(aiUsageLog)
    .where(sinceCondition)
    .groupBy(sql`strftime('%Y-%m-%d', ${aiUsageLog.createdAt}, 'unixepoch')`)
    .orderBy(sql`strftime('%Y-%m-%d', ${aiUsageLog.createdAt}, 'unixepoch')`);

  return NextResponse.json({
    rangeDays: days,
    since: since.toISOString(),
    totalsByFeature,
    byCallSite,
    byUser,
    byModel,
    recentErrors,
    daily,
  });
}
