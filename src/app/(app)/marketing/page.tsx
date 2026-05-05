import Link from "next/link";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  CheckCircle,
  LineChart,
  Target as BrandIcon,
  BookOpen,
  HeartPulse,
  Activity,
  Brain,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { adDailyInsights, decisionJournal, metaAds } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { resolveWorkspaceForUser } from "@/lib/workspace";
import { brandsAccessibleWhere } from "@/lib/brand-access";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

export const dynamic = "force-dynamic";

function daysAgoUTC(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
}

export default async function MarketingDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const ws = await resolveWorkspaceForUser(user.id);
  const userBrands = await db.query.brands.findMany({
    where: brandsAccessibleWhere(ws, user.id),
    columns: { id: true, name: true, isActive: true },
  });
  const brandIds = userBrands.map((b) => b.id);
  const activeBrandCount = userBrands.filter((b) => b.isActive).length;

  if (brandIds.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 animate-fade-in">
        <Header />
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-2">
            <BrandIcon className="h-10 w-10 text-gray-300" />
            <p className="text-gray-500">No brands in this workspace yet.</p>
            <Link
              href="/brands"
              className="text-sm text-indigo-600 hover:underline"
            >
              Create your first brand &rarr;
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const since = daysAgoUTC(7);

  const [adRows, dailyTotals, pendingApprovals] = await Promise.all([
    db
      .select({
        status: metaAds.status,
        n: sql<number>`count(*)`.as("n"),
      })
      .from(metaAds)
      .where(inArray(metaAds.brandId, brandIds))
      .groupBy(metaAds.status),
    db
      .select({
        spend: sql<number>`coalesce(sum(${adDailyInsights.spend}), 0)`.as("spend"),
        leads: sql<number>`coalesce(sum(${adDailyInsights.leads}), 0)`.as("leads"),
        impressions: sql<number>`coalesce(sum(${adDailyInsights.impressions}), 0)`.as(
          "impressions",
        ),
        clicks: sql<number>`coalesce(sum(${adDailyInsights.clicks}), 0)`.as("clicks"),
      })
      .from(adDailyInsights)
      .where(
        and(
          inArray(adDailyInsights.brandId, brandIds),
          gte(adDailyInsights.date, since),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)`.as("n") })
      .from(decisionJournal)
      .where(
        and(
          eq(decisionJournal.guardVerdict, "pending"),
          inArray(decisionJournal.brandId, brandIds),
        ),
      ),
  ]);

  const totalAds = adRows.reduce((s, r) => s + Number(r.n), 0);
  const activeAds = adRows
    .filter((r) => r.status === "ACTIVE")
    .reduce((s, r) => s + Number(r.n), 0);
  const pausedAds = adRows
    .filter((r) => r.status === "PAUSED")
    .reduce((s, r) => s + Number(r.n), 0);

  const spend = Number(dailyTotals[0]?.spend ?? 0);
  const leads = Number(dailyTotals[0]?.leads ?? 0);
  const impressions = Number(dailyTotals[0]?.impressions ?? 0);
  const clicks = Number(dailyTotals[0]?.clicks ?? 0);
  const cpl = leads > 0 && spend > 0 ? spend / leads : null;
  const ctr = impressions >= 100 ? (clicks / impressions) * 100 : null;
  const pending = Number(pendingApprovals[0]?.n ?? 0);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 animate-fade-in">
      <Header />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat
          label="Brands"
          value={`${activeBrandCount}`}
          sub={`${userBrands.length} total`}
        />
        <Stat
          label="Ads"
          value={`${totalAds}`}
          sub={`${activeAds} active · ${pausedAds} paused`}
        />
        <Stat
          label="Spend (7d)"
          value={`RM${spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={leads > 0 ? `${leads} leads` : "no leads yet"}
        />
        <Stat
          label="CPL (7d)"
          value={cpl !== null ? `RM${cpl.toFixed(2)}` : "—"}
          sub="weighted spend / leads"
        />
        <Stat
          label="CTR (7d)"
          value={ctr !== null ? `${ctr.toFixed(2)}%` : "—"}
          sub={impressions < 100 ? "needs ≥100 impressions" : "weighted"}
        />
      </div>

      <div>
        <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
          Jump to
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickLink
            href="/brands"
            icon={<BrandIcon className="h-4 w-4" />}
            label="Brands"
            description="Configure thresholds and tokens"
          />
          <QuickLink
            href="/ads"
            icon={<LineChart className="h-4 w-4" />}
            label="Ads"
            description="Audit live ad performance"
          />
          <QuickLink
            href="/approvals"
            icon={<CheckCircle className="h-4 w-4" />}
            label="Approvals"
            description="Review AI Guard recommendations"
            badge={
              pending > 0 ? (
                <Badge variant="warning">{pending} pending</Badge>
              ) : null
            }
          />
          <QuickLink
            href="/journal"
            icon={<BookOpen className="h-4 w-4" />}
            label="Decision Journal"
            description="Track every action and rationale"
          />
          <QuickLink
            href="/memory"
            icon={<Brain className="h-4 w-4" />}
            label="AI Memory"
            description="What the agent has learned"
          />
          <QuickLink
            href="/marketing/logs"
            icon={<Activity className="h-4 w-4" />}
            label="Logs"
            description="Sync, audit, and Meta API logs"
          />
          <QuickLink
            href="/marketing/health"
            icon={<HeartPulse className="h-4 w-4" />}
            label="System Health"
            description="Meta · Claude · Telegram · DB"
          />
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <LayoutDashboard className="h-6 w-6 text-indigo-500" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Marketing
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of brands, ad performance, and pending approvals
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
          {label}
        </p>
        <p className="text-xl font-semibold text-gray-900 mt-0.5 tabular-nums">
          {value}
        </p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  icon,
  label,
  description,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
    >
      <span className="mt-0.5 text-indigo-500 group-hover:text-indigo-600">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          {badge}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </Link>
  );
}
