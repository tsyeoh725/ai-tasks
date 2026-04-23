#!/usr/bin/env node
// Reset a user's password.
//
// Usage:
//   EMAIL=user@example.com NEW_PASSWORD='xxx' node scripts/reset-password.mjs
//
// Optional:
//   DB_PATH (defaults to ./data/ai-tasks.db)
//
// Safety:
//   - Does nothing if the user doesn't exist.
//   - Prints a diagnostic before and after: whether the NEW password matched
//     the OLD hash, and whether it matches the NEW hash (must be true).

import { compare, hash } from "bcryptjs";
import Database from "better-sqlite3";
import { resolve } from "node:path";

const email = process.env.EMAIL;
const newPassword = process.env.NEW_PASSWORD;
const dbPath = resolve(process.env.DB_PATH ?? "./data/ai-tasks.db");

if (!email || !newPassword) {
  console.error("EMAIL and NEW_PASSWORD env vars are required");
  process.exit(2);
}

const db = new Database(dbPath);
const row = db
  .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
  .get(email);

if (!row) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

console.log(`User: ${row.email} (${row.id})`);
console.log(`Stored hash prefix: ${row.password_hash.slice(0, 7)}… (len ${row.password_hash.length})`);
console.log(`New password matches OLD hash: ${await compare(newPassword, row.password_hash)}`);

const newHash = await hash(newPassword, 12);
db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newHash, row.id);

const after = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(row.id);
console.log(`New hash prefix: ${after.password_hash.slice(0, 7)}… (len ${after.password_hash.length})`);
console.log(`New password matches NEW hash: ${await compare(newPassword, after.password_hash)}`);
console.log("Done.");
