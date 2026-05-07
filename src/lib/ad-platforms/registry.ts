// Platform + credential registries.
//
// One discovery point for "give me the adapter / credential provider for
// platform X". Adding a new platform = registering it here in one place.
//
// `buildPlatformContext` is the standard helper for assembling a
// PlatformContext from a brand id — looks up the brand, fetches the
// credential, returns the bundle. Callers should use this rather than
// constructing PlatformContext literals by hand.

import { db } from "@/db";
import { brands } from "@/db/schema";
import { eq } from "drizzle-orm";

import type {
  AdPlatform,
  CredentialProvider,
  PlatformContext,
  PlatformId,
} from "./types";

import { metaAdapter } from "./meta";
import { metaSystemUserCredentialProvider } from "./credentials/meta-system-user";

// ============================================================================
// Registries
// ============================================================================

const ADAPTERS: Partial<Record<PlatformId, AdPlatform>> = {
  meta: metaAdapter,
  // google: googleAdapter, // future
  // tiktok: tiktokAdapter, // future
};

const CREDENTIAL_PROVIDERS: Partial<Record<PlatformId, CredentialProvider>> = {
  meta: metaSystemUserCredentialProvider,
  // future credential providers (e.g. metaOauthCredentialProvider for Plan B)
  // slot in here when added.
};

export function getAdPlatform(id: PlatformId): AdPlatform {
  const adapter = ADAPTERS[id];
  if (!adapter) {
    throw new Error(`No ad-platform adapter registered for: ${id}`);
  }
  return adapter;
}

export function getCredentialProvider(id: PlatformId): CredentialProvider {
  const provider = CREDENTIAL_PROVIDERS[id];
  if (!provider) {
    throw new Error(`No credential provider registered for: ${id}`);
  }
  return provider;
}

// ============================================================================
// Context builder
// ============================================================================

/**
 * Build a PlatformContext for the given brand. Looks up the brand row, fetches
 * a credential via the registered provider, and returns a bundle ready for any
 * AdPlatform method.
 *
 * Throws if the brand doesn't exist or the credential provider can't deliver.
 */
export async function buildPlatformContext(
  platform: PlatformId,
  brandId: string,
): Promise<PlatformContext> {
  const brand = await db.query.brands.findFirst({
    where: eq(brands.id, brandId),
  });
  if (!brand) {
    throw new Error(`Brand not found: ${brandId}`);
  }

  const credentialProvider = getCredentialProvider(platform);
  const credential = await credentialProvider.getCredential(brandId);

  return {
    brandId,
    brand: {
      id: brand.id,
      userId: brand.userId,
      metaAccountId: brand.metaAccountId,
    },
    credential,
  };
}
