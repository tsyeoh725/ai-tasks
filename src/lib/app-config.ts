// Typed accessors for the global `app_config` key/value store.
// Used by the Settings UI to override env-var defaults at runtime.
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "./secrets";

const KEYS = {
  openaiApiKey: "ai.openai_api_key",
  anthropicApiKey: "ai.anthropic_api_key",
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

export async function getOpenAIKey(): Promise<string | null> {
  return (await readSecret(KEYS.openaiApiKey)) ?? process.env.OPENAI_API_KEY ?? null;
}

export async function getAnthropicKey(): Promise<string | null> {
  return (await readSecret(KEYS.anthropicApiKey)) ?? process.env.ANTHROPIC_API_KEY ?? null;
}

export async function getAiModel(): Promise<string | null> {
  const dbVal = await readRaw(KEYS.aiModel);
  return dbVal ?? process.env.AI_MODEL ?? null;
}

export async function setOpenAIKey(key: string): Promise<void> {
  await writeSecret(KEYS.openaiApiKey, key);
}

export async function setAnthropicKey(key: string): Promise<void> {
  await writeSecret(KEYS.anthropicApiKey, key);
}

export async function setAiModel(model: string): Promise<void> {
  await writeRaw(KEYS.aiModel, model);
}

export async function clearOpenAIKey(): Promise<void> {
  await deleteRaw(KEYS.openaiApiKey);
}

export async function clearAnthropicKey(): Promise<void> {
  await deleteRaw(KEYS.anthropicApiKey);
}

/** Status object for the Settings UI — never returns the raw key. */
export type AiKeysStatus = {
  openai: { configured: boolean; source: "db" | "env" | "none"; lastFour: string | null };
  anthropic: { configured: boolean; source: "db" | "env" | "none"; lastFour: string | null };
  model: string | null;
};

export async function getAiKeysStatus(): Promise<AiKeysStatus> {
  const [openaiDb, anthropicDb, model] = await Promise.all([
    readSecret(KEYS.openaiApiKey),
    readSecret(KEYS.anthropicApiKey),
    getAiModel(),
  ]);
  const openaiEnv = process.env.OPENAI_API_KEY ?? null;
  const anthropicEnv = process.env.ANTHROPIC_API_KEY ?? null;

  const lastFour = (s: string | null) => (s ? s.slice(-4) : null);

  return {
    openai: openaiDb
      ? { configured: true, source: "db", lastFour: lastFour(openaiDb) }
      : openaiEnv
        ? { configured: true, source: "env", lastFour: lastFour(openaiEnv) }
        : { configured: false, source: "none", lastFour: null },
    anthropic: anthropicDb
      ? { configured: true, source: "db", lastFour: lastFour(anthropicDb) }
      : anthropicEnv
        ? { configured: true, source: "env", lastFour: lastFour(anthropicEnv) }
        : { configured: false, source: "none", lastFour: null },
    model,
  };
}
