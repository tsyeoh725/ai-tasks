CREATE TABLE `sync_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `type` text NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `label` text,
  `payload` text,
  `result` text,
  `error` text,
  `started_at` integer,
  `finished_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_jobs_user_status_idx` ON `sync_jobs` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `sync_jobs_created_idx` ON `sync_jobs` (`created_at`);
