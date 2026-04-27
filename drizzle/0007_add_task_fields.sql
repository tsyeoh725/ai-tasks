ALTER TABLE `tasks` ADD COLUMN `start_date` integer;
ALTER TABLE `tasks` ADD COLUMN `is_milestone` integer NOT NULL DEFAULT false;
ALTER TABLE `tasks` ADD COLUMN `task_type` text NOT NULL DEFAULT 'task';
ALTER TABLE `tasks` ADD COLUMN `estimated_hours` real;
