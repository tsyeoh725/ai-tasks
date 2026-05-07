// Re-export shim. Actual implementation moved to
// src/lib/ad-platforms/credentials/meta-system-user.ts during the
// platform-abstraction refactor (see docs/architecture.md, Phase 3).
//
// This shim keeps existing imports working until Phase 6 deletes it. Do NOT
// add new code here — edit the credentials file and let the re-export
// surface it.
export { resolveMetaAccessToken } from "@/lib/ad-platforms/credentials/meta-system-user";
