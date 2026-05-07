#!/usr/bin/env node
// Register the Telegram webhook with the SL-2 signature secret.
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     WEBHOOK_URL=https://task.edgepoint.work/api/telegram/callback \
//     node scripts/setup-telegram-webhook.mjs
//
// Run this once after setting (or rotating) TELEGRAM_WEBHOOK_SECRET. Without
// re-registering, Telegram won't include the X-Telegram-Bot-Api-Secret-Token
// header and every callback will be rejected by the route handler.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL;

if (!token || !secret || !url) {
  console.error("Missing env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL all required");
  process.exit(1);
}

if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET must be 1-256 chars of [A-Za-z0-9_-] (Telegram's restriction)");
  process.exit(1);
}

const params = new URLSearchParams({
  url,
  secret_token: secret,
  // drop_pending_updates: discard the queue Telegram has been buffering
  // while the webhook was unset / unverified. Without this, the next
  // delivery tries to replay all buffered updates with the new secret.
  drop_pending_updates: "true",
});

const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;

const res = await fetch(apiUrl, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: params.toString(),
});

const body = await res.json();
if (!res.ok || !body.ok) {
  console.error("setWebhook failed:", res.status, body);
  process.exit(1);
}

console.log("Webhook registered:", body.description || "ok");
console.log("URL:", url);
console.log("Secret token: (set, hidden)");
