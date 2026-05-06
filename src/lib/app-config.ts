// Typed accessors for the global `app_config` key/value store.
// Used by the Settings UI to override env-var defaults at runtime.
//
// **Key split (May 2026):** Jarvis (the assistant) and Audit (the marketing
// guard) now use separate API keys so we can attribute spend to one feature
// vs the other. Jarvis points at OpenAI; Audit points at Anthropic.
// The old single-pair (`ai.openai_api_key` / `ai.anthropic_api_key`) is kept
// as a transparent fallback so an existing install keeps working — newly
// saved keys land in the split slots.
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "./secrets";

const KEYS = {
  // New split keys (preferred):
  jarvisOpenaiKey: "ai.jarvis_openai_key",
  auditAnthropicKey: "ai.audit_anthropic_key",
  // Legacy keys (kept for backward compat — read-only fallback):
  legacyOpenaiKey: "ai.openai_api_key",
  legacyAnthropicKey: "ai.anthropic_api_key",
  aiModel: "ai.model",
} as const;

type ConfigKey = (typeof KEYS)[keyof typeof KEYS];

async function readRaw(key: ConfigKey): Promise<string | null> {
  const row = await db.query.appConfig.findFirst({ where: eq(appConfig.key, key) });
  return row?.value ?? null;
}

async function writeRaw(key: ConfigKey, value: string): Promise<void> {
  const existing = await db.query.appConfig.findFirst({ where: eq(appConfig.key, key) });
  if (existing) {
    await db.update(appConfig).set({ value, updatedAt: new Date() }).where(eq(appConfig.key, key));
  } else {
    await db.insert(appConfig).values({ key, value, updatedAt: new Date() });
  }
}

async function deleteRaw(key: ConfigKey): Promise<void> {
  await db.delete(appConfig).where(eq(appConfig.key, key));
}

// ---- secret values (encrypted at rest) ----

async function readSecret(key: ConfigKey): Promise<string | null> {
  const raw = await readRaw(key);
  if (!raw) return null;
  try {
    return decrypt(raw);
  } catch {
    // Stale ciphertext (e.g. NEXTAUTH_SECRET rotated). Treat as missing.
    return null;
  }
}

async function writeSecret(key: ConfigKey, value: string): Promise<void> {
  await writeRaw(key, encrypt(value));
}

// ---- public, typed API ----

// Resolution order for each key:
// 1. New split slot in DB (set via Settings UI).
// 2. New env var (FEATURE-specific: OPENAI_API_KEY_JARVIS / ANTHROPIC_API_KEY_AUDIT).
// 3. Legacy DB slot (pre-split install).
// 4. Legacy env var (pre-split install).
// 5. null.

export async function getJarvisOpenAIKey(): Promise<string | null> {
  return (
    (await readSecret(KEYS.jarvisOpenaiKey)) ??
    process.env.OPENAI_API_KEY_JARVIS ??
    (await readSecret(KEYS.legacyOpenaiKey)) ??
    process.env.OPENAI_API_KEY ??
    null
  );
}

export async function getAuditAnthropicKey(): Promise<string | null> {
  return (
    (await readSecret(KEYS.auditAnthropicKey)) ??
    process.env.ANTHROPIC_API_KEY_AUDIT ??
    (await readSecret(KEYS.legacyAnthropicKey)) ??
    process.env.ANTHROPIC_API_KEY ??
    null
  );
}

// Legacy accessors — kept so older modules compile, but they delegate to
// the split accessors. Direct callers should migrate to getJarvisOpenAIKey
// / getAuditAnthropicKey for clarity.
export async function getOpenAIKey(): Promise<string | null> {
  return getJarvisOpenAIKey();
}

export async function getAnthropicKey(): Promise<string | null> {
  return getAuditAnthropicKey();
}

export async function getAiModel(): Promise<string | null> {
  const dbVal = await readRaw(KEYS.aiModel);
  return dbVal ?? process.env.AI_MODEL ?? null;
}

export async function setJarvisOpenAIKey(key: string): Promise<void> {
  await writeSecret(KEYS.jarvisOpenaiKey, key);
}

export async function setAuditAnthropicKey(key: string): Promise<void> {
  await writeSecret(KEYS.auditAnthropicKey, key);
}

export async function setAiModel(model: string): Promise<void> {
  await writeRaw(KEYS.aiModel, model);
}

export async function clearJarvisOpenAIKey(): Promise<void> {
  await deleteRaw(KEYS.jarvisOpenaiKey);
}

export async function clearAuditAnthropicKey(): Promise<void> {
  await deleteRaw(KEYS.auditAnthropicKey);
}

/** Status object for the Settings UI — never returns the raw key. */
export type AiKeySource = "db" | "env" | "legacy_db" | "legacy_env" | "none";
export type AiKeyStatus = { configured: boolean; source: AiKeySource; lastFour: string | null };
export type AiKeysStatus = {
  jarvis: AiKeyStatus;
  audit: AiKeyStatus;
  model: string | null;
};

async function resolveStatus(
  splitDbKey: ConfigKey,
  splitEnvVar: string,
  legacyDbKey: ConfigKey,
  legacyEnvVar: string,
): Promise<AiKeyStatus> {
  const lastFour = (s: string | null) => (s ? s.slice(-4) : null);
  const splitDb = await readSecret(splitDbKey);
  if (splitDb) return { configured: true, source: "db", lastFour: lastFour(splitDb) };
  const splitEnv = process.env[splitEnvVar] ?? null;
  if (splitEnv) return { configured: true, source: "env", lastFour: lastFour(splitEnv) };
  const legacyDb = await readSecret(legacyDbKey);
  if (legacyDb) return { configured: true, source: "legacy_db", lastFour: lastFour(legacyDb) };
  const legacyEnv = process.env[legacyEnvVar] ?? null;
  if (legacyEnv) return { configured: true, source: "legacy_env", lastFour: lastFour(legacyEnv) };
  return { configured: false, source: "none", lastFour: null };
}

export async function getAiKeysStatus(): Promise<AiKeysStatus> {
  const [jarvis, audit, model] = await Promise.all([
    resolveStatus(
      KEYS.jarvisOpenaiKey,
      "OPENAI_API_KEY_JARVIS",
      KEYS.legacyOpenaiKey,
      "OPENAI_API_KEY",
    ),
    resolveStatus(
      KEYS.auditAnthropicKey,
      "ANTHROPIC_API_KEY_AUDIT",
      KEYS.legacyAnthropicKey,
      "ANTHROPIC_API_KEY",
    ),
    getAiModel(),
  ]);
  return { jarvis, audit, model };
}
