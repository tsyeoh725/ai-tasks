// Meta system-user credential resolver.
//
// Two surfaces today:
//   - resolveMetaAccessToken(brand) — legacy string-returning function used
//     by routes/services that haven't migrated yet. Kept stable.
//   - metaSystemUserCredentialProvider — implements CredentialProvider for
//     the new platform-abstraction code path. Wraps the same resolution in
//     a Credential discriminated union.
//
// Resolution priority (both surfaces use the same logic):
//   1. brand.metaAccessToken (per-brand override; not currently a real column
//      but the type allows it for future per-brand keys)
//   2. globalSettings.meta_access_token for the brand owner (set via the
//      Settings → Meta Ads UI)
//   3. process.env.META_ACCESS_TOKEN (server default)
//
// Phase 5 will route core-monitor / scheduler / action-executor through the
// CredentialProvider; Phase 6 deletes resolveMetaAccessToken once no caller
// imports it.

import { db } from "@/db";
import { brands, globalSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type {
  Credential,
  CredentialProvider,
  PlatformId,
} from "@/lib/ad-platforms/types";

type BrandLike = { metaAccessToken?: string | null; userId: string };

/**
 * Legacy entry point. New code should depend on `CredentialProvider` instead.
 */
export async function resolveMetaAccessToken(
  brand: BrandLike,
): Promise<string | null> {
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

/**
 * Implements `CredentialProvider` for Meta using the same 3-tier resolution
 * as `resolveMetaAccessToken`. Looks up the brand by id (the provider's input
 * is a brand id, not a brand object) so callers don't have to pass anything
 * platform-specific.
 *
 * Throws if no token is configured — callers can't usefully proceed without
 * one and silent fallthrough hides misconfiguration.
 */
export class MetaSystemUserCredentialProvider implements CredentialProvider {
  readonly platform: PlatformId = "meta";

  async getCredential(brandId: string): Promise<Credential> {
    const brand = await db.query.brands.findFirst({
      where: eq(brands.id, brandId),
    });
    if (!brand) {
      throw new Error(`Brand not found: ${brandId}`);
    }

    // The brands table doesn't have a metaAccessToken column today, but the
    // BrandLike shape allows for it. Pass undefined explicitly so the resolver
    // falls through to globalSettings → env.
    const token = await resolveMetaAccessToken({
      metaAccessToken: undefined,
      userId: brand.userId,
    });

    if (!token) {
      throw new Error(
        `No Meta access token configured for brand ${brandId} ` +
          `(checked brand override, user globalSettings, env).`,
      );
    }

    return { kind: "system_user_token", token };
  }
}

/**
 * Singleton — credential providers are stateless, so one instance is enough.
 */
export const metaSystemUserCredentialProvider =
  new MetaSystemUserCredentialProvider();
