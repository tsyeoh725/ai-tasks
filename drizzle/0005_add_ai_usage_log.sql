CREATE TABLE `ai_usage_log` (
  `id` text PRIMARY KEY NOT NULL,
  `feature` text NOT NULL,
  `call_site` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `user_id` text,
  `conversation_id` text,
  `input_tokens` integer DEFAULT 0 NOT NULL,
  `output_tokens` integer DEFAULT 0 NOT NULL,
  `cache_creation_tokens` integer DEFAULT 0 NOT NULL,
  `cache_read_tokens` integer DEFAULT 0 NOT NULL,
  `cost_usd` real DEFAULT 0 NOT NULL,
  `latency_ms` integer,
  `status` text NOT NULL,
  `error_message` text,
  `request_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_usage_log_created_idx` ON `ai_usage_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_log_feature_created_idx` ON `ai_usage_log` (`feature`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_log_call_site_created_idx` ON `ai_usage_log` (`call_site`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_log_user_created_idx` ON `ai_usage_log` (`user_id`, `created_at`);
