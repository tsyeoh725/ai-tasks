ALTER TABLE `tasks` ADD COLUMN `start_date` integer;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `is_milestone` integer NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `task_type` text NOT NULL DEFAULT 'task';
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `estimated_hours` real;
