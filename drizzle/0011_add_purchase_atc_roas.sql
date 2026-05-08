-- F-76: surface purchases / add-to-carts / ROAS as standalone tile metrics.
--
-- Up to now the sync threw away every action_type from Meta's `actions[]`
-- array except the brand's configured cost metric (summed into `leads`).
-- That means ecom brands tracking purchases as their cost metric had
-- purchase counts buried in `leads` while ATC counts were dropped on the
-- floor. ROAS wasn't pulled at all — `action_values` was never in the
-- insights fields list.
--
-- New columns on meta_ads + ad_daily_insights:
--   purchases       — count of `purchase` action_type events
--   add_to_carts    — count of `add_to_cart` action_type events
--   purchase_value  — RM value of `purchase` actions (from action_values[])
--
-- ROAS is computed at read time as purchase_value / spend so we don't
-- store a derived column that can drift from its inputs. Existing rows
-- read 0 for the new counts and 0.0 for purchase_value until the next
-- sync repopulates them.

ALTER TABLE `meta_ads` ADD COLUMN `purchases` integer DEFAULT 0 NOT NULL;
ALTER TABLE `meta_ads` ADD COLUMN `add_to_carts` integer DEFAULT 0 NOT NULL;
ALTER TABLE `meta_ads` ADD COLUMN `purchase_value` real DEFAULT 0 NOT NULL;

ALTER TABLE `ad_daily_insights` ADD COLUMN `purchases` integer DEFAULT 0 NOT NULL;
ALTER TABLE `ad_daily_insights` ADD COLUMN `add_to_carts` integer DEFAULT 0 NOT NULL;
ALTER TABLE `ad_daily_insights` ADD COLUMN `purchase_value` real DEFAULT 0 NOT NULL;
