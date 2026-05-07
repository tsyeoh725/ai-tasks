-- SL-8: indexes on hot foreign-key + filter columns.
--
-- The 0000_init migration created 60+ tables and 0 indexes, which is fine
-- at 5 users / few k rows but cliffs hard at 50 users / 100k tasks. Every
-- AI tool call does inArray(tasks.projectId, accessibleIds) — without an
-- index on tasks.project_id this is a full table scan per call, and the
-- model's natural retry behavior amplifies it.
--
-- All `IF NOT EXISTS` so this migration is idempotent if a future drizzle-
-- kit run regenerates these via the schema.

CREATE INDEX IF NOT EXISTS `tasks_project_idx`        ON `tasks` (`project_id`);
CREATE INDEX IF NOT EXISTS `tasks_assignee_idx`       ON `tasks` (`assignee_id`);
CREATE INDEX IF NOT EXISTS `tasks_status_idx`         ON `tasks` (`status`);
CREATE INDEX IF NOT EXISTS `tasks_due_idx`            ON `tasks` (`due_date`);
CREATE INDEX IF NOT EXISTS `tasks_section_idx`        ON `tasks` (`section_id`);
CREATE INDEX IF NOT EXISTS `tasks_client_idx`         ON `tasks` (`client_id`);

CREATE INDEX IF NOT EXISTS `projects_owner_idx`       ON `projects` (`owner_id`);
CREATE INDEX IF NOT EXISTS `projects_team_idx`        ON `projects` (`team_id`);

CREATE INDEX IF NOT EXISTS `team_members_user_idx`    ON `team_members` (`user_id`);
CREATE INDEX IF NOT EXISTS `team_members_team_idx`    ON `team_members` (`team_id`);

CREATE INDEX IF NOT EXISTS `ai_messages_conversation_idx` ON `ai_messages` (`conversation_id`);
CREATE INDEX IF NOT EXISTS `ai_conversations_user_idx`    ON `ai_conversations` (`user_id`);

CREATE INDEX IF NOT EXISTS `task_comments_task_idx`   ON `task_comments` (`task_id`);

CREATE INDEX IF NOT EXISTS `notifications_user_idx`   ON `notifications` (`user_id`);
CREATE INDEX IF NOT EXISTS `notifications_user_read_idx` ON `notifications` (`user_id`, `is_read`);

CREATE INDEX IF NOT EXISTS `time_blocks_user_idx`     ON `time_blocks` (`user_id`);
CREATE INDEX IF NOT EXISTS `time_blocks_user_start_idx` ON `time_blocks` (`user_id`, `start_time`);
CREATE INDEX IF NOT EXISTS `time_blocks_task_idx`     ON `time_blocks` (`task_id`);

CREATE INDEX IF NOT EXISTS `ai_usage_log_user_created_idx` ON `ai_usage_log` (`user_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `ai_usage_log_created_idx` ON `ai_usage_log` (`created_at`);

CREATE INDEX IF NOT EXISTS `task_activities_task_idx` ON `task_activities` (`task_id`);

CREATE INDEX IF NOT EXISTS `decision_journal_user_idx`    ON `decision_journal` (`user_id`);
CREATE INDEX IF NOT EXISTS `decision_journal_brand_idx`   ON `decision_journal` (`brand_id`);
CREATE INDEX IF NOT EXISTS `decision_journal_verdict_idx` ON `decision_journal` (`guard_verdict`);

CREATE INDEX IF NOT EXISTS `meta_ads_brand_idx`       ON `meta_ads` (`brand_id`);
CREATE INDEX IF NOT EXISTS `meta_ads_status_idx`      ON `meta_ads` (`status`);

CREATE INDEX IF NOT EXISTS `telegram_links_chat_idx`  ON `telegram_links` (`telegram_chat_id`);

CREATE INDEX IF NOT EXISTS `telegram_link_codes_expires_idx` ON `telegram_link_codes` (`expires_at`);

CREATE INDEX IF NOT EXISTS `api_keys_user_idx`        ON `api_keys` (`user_id`);
CREATE INDEX IF NOT EXISTS `api_keys_revoked_idx`     ON `api_keys` (`revoked_at`);

CREATE INDEX IF NOT EXISTS `documents_project_idx`    ON `documents` (`project_id`);
CREATE INDEX IF NOT EXISTS `task_attachments_task_idx` ON `task_attachments` (`task_id`);

CREATE INDEX IF NOT EXISTS `forms_project_idx`        ON `forms` (`project_id`);
CREATE INDEX IF NOT EXISTS `form_submissions_form_idx` ON `form_submissions` (`form_id`);
CREATE INDEX IF NOT EXISTS `form_fields_form_idx`     ON `form_fields` (`form_id`);
