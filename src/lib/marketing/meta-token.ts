// Resolve the Meta Graph API access token for a given user/brand.
// Priority order:
//   1. brand.metaAccessToken (per-brand override; not currently in schema but
//      reserved for future per-brand keys)
//   2. globalSettings.meta_access_token for the brand owner (set via
//      Settings → Meta Ads in the UI)
//   3. process.env.META_ACCESS_TOKEN (server default)
import { db } from "@/db";
import { globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type BrandLike = { metaAccessToken?: string | null; userId: string };

export async function resolveMetaAccessToken(brand: BrandLike): Promise<string | null> {
  if (brand.metaAccessToken) return brand.metaAccessToken;

  const row = await db.query.globalSettings.findFirst({
    where: and(
      eq(globalSettings.userId, brand.userId),
      eq(globalSettings.key, "meta_access_token"),
    ),
  });
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === "string" && parsed.length > 0) return parsed;
    } catch {
      // Not JSON — treat as raw string.
      if (row.value.length > 0) return row.value;
    }
  }

  return process.env.META_ACCESS_TOKEN ?? null;
}
