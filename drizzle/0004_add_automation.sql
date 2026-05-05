CREATE TABLE `automation_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `brand_id` text NOT NULL,
  `enabled` integer DEFAULT false NOT NULL,
  `cadence_hours` integer DEFAULT 6 NOT NULL,
  `auto_approve_min_confidence` real DEFAULT 0.85 NOT NULL,
  `auto_approve_actions` text DEFAULT '["pause","kill"]' NOT NULL,
  `last_cycle_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `automation_settings_brand_idx` ON `automation_settings` (`brand_id`);
--> statement-breakpoint
CREATE TABLE `cycle_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `cycle_id` text NOT NULL,
  `brand_id` text NOT NULL,
  `step` text NOT NULL,
  `status` text NOT NULL,
  `trigger` text NOT NULL,
  `result` text,
  `error` text,
  `started_at` integer,
  `finished_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cycle_runs_cycle_idx` ON `cycle_runs` (`cycle_id`);
--> statement-breakpoint
CREATE INDEX `cycle_runs_brand_created_idx` ON `cycle_runs` (`brand_id`, `created_at`);
