/**
 * migrate-from-supabase.ts
 *
 * One-shot import of Jarvis Supabase data into the ai-tasks SQLite DB.
 *
 * Reads from Supabase REST via @supabase/supabase-js and inserts into Drizzle.
 * All rows are assigned to a single owning user (MIGRATION_DEFAULT_USER_ID, or the
 * first row in `users`). Each Jarvis brand gets an auto-created linked ai-tasks
 * project so brand work shows up in the main projects list.
 *
 * Env vars (see .env.local):
 *   MIGRATION_SUPABASE_URL         - Supabase project URL
 *   MIGRATION_SUPABASE_SERVICE_KEY - Supabase service role key (bypasses RLS)
 *   MIGRATION_DEFAULT_USER_ID      - optional; if set, assigns all rows to that user
 *
 * Usage:  npx tsx scripts/migrate-from-supabase.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Load .env.local manually if dotenv didn't pick it up (Next projects usually keep it there).
const envLocal = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

const SUPABASE_URL = process.env.MIGRATION_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.MIGRATION_SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing MIGRATION_SUPABASE_URL or MIGRATION_SUPABASE_SERVICE_KEY in env");
  process.exit(1);
}

// We import after env setup so the DB singleton picks up the right working dir.
async function main() {
  const { db, schema } = await import("../src/db");
  const {
    users,
    projects,
    brands,
    metaCampaigns,
    metaAdSets,
    metaAds,
    adDailyInsights,
    decisionJournal,
    agentMemory,
    marketingAuditLog,
    globalSettings,
  } = schema;

  const supa: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Resolve owner user ----
  let ownerId = process.env.MIGRATION_DEFAULT_USER_ID;
  if (!ownerId) {
    const firstUser = await db.select().from(users).limit(1);
    if (firstUser.length === 0) {
      console.error("No users found in SQLite DB. Create a user first or set MIGRATION_DEFAULT_USER_ID.");
      process.exit(1);
    }
    ownerId = firstUser[0].id;
    console.log(`Using first user as owner: ${firstUser[0].email} (${ownerId})`);
  } else {
    console.log(`Using MIGRATION_DEFAULT_USER_ID: ${ownerId}`);
  }

  // ---- Page helper ----
  async function fetchAll<T extends Record<string, unknown>>(
    table: string,
    orderBy = "created_at"
  ): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supa
        .from(table)
        .select("*")
        .order(orderBy, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        // Table may not exist or have no `created_at` column — retry without order
        if (error.message?.includes("does not exist") || error.code === "42P01") {
          console.warn(`  Table '${table}' does not exist — skipping`);
          return [];
        }
        if (error.message?.includes(orderBy)) {
          // Fall back to unordered fetch
          const fallback = await supa.from(table).select("*").range(from, from + PAGE - 1);
          if (fallback.error) {
            console.warn(`  ${table} page ${from}: ${fallback.error.message} — skipping`);
            return all;
          }
          const rows = (fallback.data as T[]) || [];
          all.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
          continue;
        }
        console.warn(`  ${table} page ${from}: ${error.message} — stopping`);
        return all;
      }
      const rows = (data as T[]) || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  function ts(iso: string | null | undefined): Date {
    if (!iso) return new Date(0);
    const d = new Date(iso);
    return isNaN(d.getTime()) ? new Date(0) : d;
  }

  function jstr(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  }

  const stats = {
    brands: 0,
    campaigns: 0,
    adSets: 0,
    ads: 0,
    dailyInsights: 0,
    journal: 0,
    memory: 0,
    audit: 0,
    settings: 0,
    projectsCreated: 0,
  };

  // ---- 1. Brands (+ auto-create linked project per brand) ----
  console.log("\n-> Importing brands...");
  const srcBrands = await fetchAll<Record<string, unknown>>("brands");
  console.log(`   Fetched ${srcBrands.length} brands from Supabase`);
  for (const b of srcBrands) {
    try {
      const now = new Date();
      // Create a linked project for this brand
      const projectId = randomUUID();
      await db
        .insert(projects)
        .values({
          id: projectId,
          name: `${b.name as string} Ads`,
          description: `Meta ads for ${b.name as string}`,
          color: "#f97316",
          icon: "\u{1F3AF}", // 🎯
          ownerId: ownerId!,
          teamId: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
      stats.projectsCreated++;

      await db
        .insert(brands)
        .values({
          id: b.id as string,
          userId: ownerId!,
          projectId,
          name: b.name as string,
          metaAccountId: (b.meta_account_id as string) ?? "",
          config: jstr(b.config) ?? "{}",
          isActive: (b.is_active as boolean) ?? true,
          createdAt: ts(b.created_at as string),
          updatedAt: ts(b.updated_at as string),
        })
        .onConflictDoNothing();
      stats.brands++;
    } catch (err) {
      console.warn(`   Skipped brand ${b.id}: ${(err as Error).message}`);
    }
  }

  // ---- 2. Campaigns ----
  console.log("\n-> Importing meta campaigns...");
  const srcCamps = await fetchAll<Record<string, unknown>>("campaigns");
  console.log(`   Fetched ${srcCamps.length} campaigns`);
  for (const c of srcCamps) {
    try {
      await db
        .insert(metaCampaigns)
        .values({
          id: c.id as string,
          userId: ownerId!,
          brandId: c.brand_id as string,
          metaCampaignId: (c.meta_campaign_id as string) ?? "",
          name: (c.name as string) ?? "",
          status: (c.status as string) ?? "UNKNOWN",
          objective: (c.objective as string) ?? null,
          dailyBudget: (c.daily_budget as number) ?? null,
          lifetimeBudget: (c.lifetime_budget as number) ?? null,
          syncedAt: ts(c.synced_at as string),
          createdAt: ts(c.created_at as string),
        })
        .onConflictDoNothing();
      stats.campaigns++;
    } catch (err) {
      console.warn(`   Skipped campaign ${c.id}: ${(err as Error).message}`);
    }
  }

  // ---- 3. Ad Sets ----
  console.log("\n-> Importing meta ad sets...");
  const srcAdSets = await fetchAll<Record<string, unknown>>("ad_sets");
  console.log(`   Fetched ${srcAdSets.length} ad sets`);
  for (const a of srcAdSets) {
    try {
      await db
        .insert(metaAdSets)
        .values({
          id: a.id as string,
          userId: ownerId!,
          campaignId: a.campaign_id as string,
          brandId: a.brand_id as string,
          metaAdsetId: (a.meta_adset_id as string) ?? "",
          name: (a.name as string) ?? "",
          status: (a.status as string) ?? "UNKNOWN",
          dailyBudget: (a.daily_budget as number) ?? null,
          syncedAt: ts(a.synced_at as string),
          createdAt: ts(a.created_at as string),
        })
        .onConflictDoNothing();
      stats.adSets++;
    } catch (err) {
      console.warn(`   Skipped ad set ${a.id}: ${(err as Error).message}`);
    }
  }

  // ---- 4. Ads ----
  console.log("\n-> Importing meta ads...");
  const srcAds = await fetchAll<Record<string, unknown>>("ads");
  console.log(`   Fetched ${srcAds.length} ads`);
  for (const ad of srcAds) {
    try {
      await db
        .insert(metaAds)
        .values({
          id: ad.id as string,
          userId: ownerId!,
          adSetId: ad.ad_set_id as string,
          brandId: ad.brand_id as string,
          metaAdId: (ad.meta_ad_id as string) ?? "",
          name: (ad.name as string) ?? "",
          status: (ad.status as string) ?? "UNKNOWN",
          cpl: (ad.cpl as number) ?? null,
          ctr: (ad.ctr as number) ?? null,
          frequency: (ad.frequency as number) ?? null,
          spend: (ad.spend as number) ?? 0,
          impressions: (ad.impressions as number) ?? 0,
          clicks: (ad.clicks as number) ?? 0,
          leads: (ad.leads as number) ?? 0,
          syncedAt: ts(ad.synced_at as string),
          createdAt: ts(ad.created_at as string),
        })
        .onConflictDoNothing();
      stats.ads++;
    } catch (err) {
      console.warn(`   Skipped ad ${ad.id}: ${(err as Error).message}`);
    }
  }

  // ---- 5. Ad Daily Insights (big one — 13k+ rows) ----
  console.log("\n-> Importing ad daily insights (this may take a minute)...");
  const srcDaily = await fetchAll<Record<string, unknown>>("ad_daily_insights");
  console.log(`   Fetched ${srcDaily.length} daily rows`);
  const CHUNK = 500;
  for (let i = 0; i < srcDaily.length; i += CHUNK) {
    const slice = srcDaily.slice(i, i + CHUNK);
    const values = slice.map((d) => ({
      id: d.id as string,
      userId: ownerId!,
      adId: d.ad_id as string,
      brandId: d.brand_id as string,
      date: (d.date as string) ?? "",
      spend: (d.spend as number) ?? 0,
      impressions: (d.impressions as number) ?? 0,
      clicks: (d.clicks as number) ?? 0,
      leads: (d.leads as number) ?? 0,
      cpl: (d.cpl as number) ?? null,
      ctr: (d.ctr as number) ?? null,
      frequency: (d.frequency as number) ?? null,
      createdAt: ts(d.created_at as string),
    }));
    try {
      await db.insert(adDailyInsights).values(values).onConflictDoNothing();
      stats.dailyInsights += values.length;
      if ((i / CHUNK) % 5 === 0) {
        console.log(`   ...${Math.min(i + CHUNK, srcDaily.length)}/${srcDaily.length}`);
      }
    } catch (err) {
      // Fall back to single-row inserts so one bad row doesn't drop a whole batch.
      console.warn(`   Batch ${i} failed (${(err as Error).message}) — retrying row-by-row`);
      for (const v of values) {
        try {
          await db.insert(adDailyInsights).values(v).onConflictDoNothing();
          stats.dailyInsights++;
        } catch {
          /* skip bad row */
        }
      }
    }
  }

  // ---- 6. Decision Journal ----
  console.log("\n-> Importing decision journal...");
  const srcJournal = await fetchAll<Record<string, unknown>>("decision_journal");
  console.log(`   Fetched ${srcJournal.length} journal entries`);
  for (const j of srcJournal) {
    try {
      await db
        .insert(decisionJournal)
        .values({
          id: j.id as string,
          userId: ownerId!,
          brandId: j.brand_id as string,
          adId: (j.ad_id as string) ?? null,
          adSetId: (j.ad_set_id as string) ?? null,
          recommendation: j.recommendation as "kill" | "pause" | "boost_budget" | "duplicate",
          reason: (j.reason as string) ?? "",
          kpiValues: jstr(j.kpi_values),
          guardVerdict: j.guard_verdict as "approved" | "rejected" | "pending",
          guardReasoning: (j.guard_reasoning as string) ?? null,
          confidence: (j.confidence as number) ?? null,
          riskLevel: (j.risk_level as "low" | "medium" | "high" | null) ?? null,
          actionTaken: (j.action_taken as boolean) ?? false,
          actionResult: jstr(j.action_result),
          createdAt: ts(j.created_at as string),
        })
        .onConflictDoNothing();
      stats.journal++;
    } catch (err) {
      console.warn(`   Skipped journal ${j.id}: ${(err as Error).message}`);
    }
  }

  // ---- 7. Agent Memory ----
  console.log("\n-> Importing agent memory...");
  const srcMem = await fetchAll<Record<string, unknown>>("agent_memory");
  console.log(`   Fetched ${srcMem.length} memory rows`);
  for (const m of srcMem) {
    try {
      await db
        .insert(agentMemory)
        .values({
          id: m.id as string,
          userId: ownerId!,
          brandId: m.brand_id as string,
          memoryType: m.memory_type as "weekly_summary" | "preference" | "pattern",
          content: (m.content as string) ?? "",
          metadata: null, // not present in source
          createdAt: ts(m.created_at as string),
        })
        .onConflictDoNothing();
      stats.memory++;
    } catch (err) {
      console.warn(`   Skipped memory ${m.id}: ${(err as Error).message}`);
    }
  }

  // ---- 8. Marketing Audit Log ----
  console.log("\n-> Importing marketing audit log...");
  const srcAudit = await fetchAll<Record<string, unknown>>("audit_log");
  console.log(`   Fetched ${srcAudit.length} audit rows`);
  for (const a of srcAudit) {
    try {
      // Jarvis's audit_log has no level or session_id columns; leave null.
      const payloadStr = jstr(a.payload);
      // If payload has a logs[].level, we can't split them up cleanly — keep the blob.
      await db
        .insert(marketingAuditLog)
        .values({
          id: a.id as string,
          userId: ownerId!,
          sessionId: null,
          eventType: (a.event_type as string) ?? "unknown",
          entityType: (a.entity_type as string) ?? null,
          entityId: (a.entity_id as string) ?? null,
          payload: payloadStr,
          level: null,
          createdAt: ts(a.created_at as string),
        })
        .onConflictDoNothing();
      stats.audit++;
    } catch (err) {
      console.warn(`   Skipped audit ${a.id}: ${(err as Error).message}`);
    }
  }

  // ---- 9. Global Settings ----
  console.log("\n-> Importing global settings...");
  // global_settings has (key, value, updated_at) and no id/created_at; fall back to no order
  const { data: settingsData, error: settingsErr } = await supa.from("global_settings").select("*");
  const srcSettings = (settingsErr ? [] : (settingsData as Record<string, unknown>[] | null)) ?? [];
  console.log(`   Fetched ${srcSettings.length} settings keys`);
  for (const s of srcSettings) {
    try {
      await db
        .insert(globalSettings)
        .values({
          id: randomUUID(),
          userId: ownerId!,
          key: s.key as string,
          value: jstr(s.value) ?? "null",
          updatedAt: ts(s.updated_at as string),
        })
        .onConflictDoNothing();
      stats.settings++;
    } catch (err) {
      console.warn(`   Skipped setting ${s.key}: ${(err as Error).message}`);
    }
  }

  // ---- Summary ----
  console.log(
    `\nImported ${stats.brands} brands, ${stats.campaigns} campaigns, ${stats.adSets} ad sets, ${stats.ads} ads, ${stats.dailyInsights} daily insights, ${stats.journal} journal entries, ${stats.memory} memories, ${stats.audit} audit log entries.`
  );
  console.log(`Auto-created ${stats.projectsCreated} linked projects and ${stats.settings} settings rows.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
