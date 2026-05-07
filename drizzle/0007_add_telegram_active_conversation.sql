-- Per-link Jarvis conversation pointer.
--
-- Telegram chats are 1:1 with a user, so we can stash the active conversation
-- id directly on the link row instead of querying ai_conversations by title.
-- That keeps follow-up turns inside the same conversation thread (so Jarvis
-- has memory of earlier messages) while still letting users start fresh via
-- /reset.
--
-- Plain TEXT (no FK at SQL level) so the column can be set NULL when the
-- referenced conversation is deleted — and so we don't fight SQLite's
-- limited ALTER TABLE support for adding constrained columns to existing
-- non-empty tables. The schema models the relationship in app code only.

ALTER TABLE `telegram_links` ADD COLUMN `active_conversation_id` text;
