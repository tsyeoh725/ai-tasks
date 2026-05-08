-- F-76: surface purchases / add-to-carts / ROAS as standalone tile metrics.
--
-- Up to now the sync threw away every action_type from Meta's actions[]
-- array except the brand's configured cost metric (summed into `leads`).
-- That means ecom brands tracking purchases as their cost metric had
-- purchase counts buried in `leads` while ATC counts were dropped on the
-- floor. ROAS wasn't pulled at all — action_values was never in the
-- insights fields list.
--
-- New columns on meta_ads + ad_daily_insights:
--   purchases       — count of purchase action_type events
--   add_to_carts    — count of add_to_cart action_type events
--   purchase_value  — RM value of purchase actions (from action_values[])
--
-- ROAS is computed at read time as purchase_value / spend so we don't
-- store a derived column that can drift from its inputs. Existing rows
-- read 0 for the new counts and 0.0 for purchase_value until the next
-- sync repopulates them.
--
-- The breakpoint markers below are REQUIRED: drizzle's better-sqlite3
-- migrator splits the file on those markers and feeds each chunk to
-- db.prepare().run(), and better-sqlite3's prepare() only accepts a
-- single statement per call. The first revision of this migration
-- omitted the markers; drizzle then passed all 6 ALTERs as one chunk
-- to prepare(), which threw a syntax error, which crashed
-- docker-entrypoint.sh, which crash-looped the container.

ALTER TABLE `meta_ads` ADD COLUMN `purchases` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `meta_ads` ADD COLUMN `add_to_carts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `meta_ads` ADD COLUMN `purchase_value` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ad_daily_insights` ADD COLUMN `purchases` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ad_daily_insights` ADD COLUMN `add_to_carts` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ad_daily_insights` ADD COLUMN `purchase_value` real DEFAULT 0 NOT NULL;
