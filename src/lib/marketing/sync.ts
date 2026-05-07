// Re-export shim. Actual implementation moved to src/lib/ad-platforms/meta/sync.ts
// during the platform-abstraction refactor (see docs/architecture.md, Phase 2).
//
// This shim keeps existing imports working until Phase 6 deletes it. Do NOT
// add new code here — edit ad-platforms/meta/sync.ts and let the re-export
// surface it.
export * from "@/lib/ad-platforms/meta/sync";
