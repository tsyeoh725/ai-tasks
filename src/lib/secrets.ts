// AES-256-GCM symmetric encryption for secrets stored in the DB
// (e.g. user-supplied API keys saved via the Settings UI).
//
// Key derivation: SHA-256 of NEXTAUTH_SECRET → 32-byte AES key.
// If NEXTAUTH_SECRET ever rotates, all stored ciphertexts become unreadable.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET must be set to encrypt/decrypt stored secrets");
  }
  return createHash("sha256").update(secret).digest();
}

export type EncryptedBlob = {
  iv: string;
  tag: string;
  data: string;
};

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const blob: EncryptedBlob = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: enc.toString("base64"),
  };
  return JSON.stringify(blob);
}

export function decrypt(serialized: string): string {
  const blob = JSON.parse(serialized) as EncryptedBlob;
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/** Show only the last 4 chars of a key — for safe display in the UI. */
export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 7)}${"•".repeat(Math.max(8, value.length - 11))}${value.slice(-4)}`;
}
