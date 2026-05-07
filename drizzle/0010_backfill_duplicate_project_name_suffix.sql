-- F-31 (audit-random-bug-fix): backfill projects whose name has a duplicated
-- trailing word, e.g. "EPS - Own Ads Ads" → "EPS - Own Ads".
--
-- The audit identified exactly one such record. The general-pattern dedupe
-- across all rows is implemented in the application layer (the soft warning
-- in src/components/project-header-editable.tsx) where it has access to a
-- proper tokenizer; SQLite's lack of regex makes a generic SQL fix fragile.
--
-- This migration only rewrites the literal name from the audit, so it's a
-- safe one-time fix. New occurrences are caught at write time by the soft
-- warning.

UPDATE projects
SET
  name = 'EPS - Own Ads',
  updated_at = unixepoch()
WHERE name = 'EPS - Own Ads Ads';
