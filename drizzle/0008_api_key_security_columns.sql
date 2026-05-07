-- API key security hardening (HI-03, HI-04 / SL-6).
--
-- Adds:
--   salt        — per-row random salt for HMAC-SHA-256. NULL means a legacy
--                 SHA-256 + global API_KEY_SALT key, kept verifiable so
--                 existing integrations don't break.
--   expires_at  — optional expiry; NULL = never expires.
--   revoked_at  — explicit revocation timestamp. NULL = active.
--                 The /api/keys/[id] DELETE handler now sets this instead of
--                 deleting the row, so we keep an audit trail.

ALTER TABLE `api_keys` ADD COLUMN `salt` text;
--> statement-breakpoint
ALTER TABLE `api_keys` ADD COLUMN `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `api_keys` ADD COLUMN `revoked_at` integer;
