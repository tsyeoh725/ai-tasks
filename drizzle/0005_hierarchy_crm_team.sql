-- 1. tasks: add client_id (nullable, set null on client delete)
ALTER TABLE `tasks` ADD `client_id` text REFERENCES clients(id);
--> statement-breakpoint

-- 2. clients: add services JSON array
ALTER TABLE `clients` ADD `services` text DEFAULT '[]';
--> statement-breakpoint

-- 3. project_clients junction
CREATE TABLE `project_clients` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `client_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- 4. leads
CREATE TABLE `leads` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `team_id` text,
  `name` text NOT NULL,
  `email` text,
  `phone` text,
  `company` text,
  `website` text,
  `job_title` text,
  `source` text DEFAULT 'manual' NOT NULL,
  `source_detail` text,
  `status` text DEFAULT 'new' NOT NULL,
  `estimated_value` real,
  `currency` text DEFAULT 'USD',
  `services` text DEFAULT '[]',
  `notes` text,
  `tags` text DEFAULT '[]',
  `custom_fields` text DEFAULT '{}',
  `converted_client_id` text,
  `converted_at` integer,
  `last_contacted_at` integer,
  `next_follow_up_at` integer,
  `assigned_to_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade,
  FOREIGN KEY (`converted_client_id`) REFERENCES `clients`(`id`) ON DELETE set null,
  FOREIGN KEY (`assigned_to_id`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint

-- 5. lead_activities
CREATE TABLE `lead_activities` (
  `id` text PRIMARY KEY NOT NULL,
  `lead_id` text NOT NULL,
  `user_id` text,
  `type` text DEFAULT 'note' NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null
);
--> statement-breakpoint

-- 6. team_workspace
CREATE TABLE `team_workspace` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `team_id` text,
  `character` text DEFAULT 'dev_1' NOT NULL,
  `character_color` text DEFAULT '#99ff33' NOT NULL,
  `x` integer DEFAULT 5 NOT NULL,
  `y` integer DEFAULT 5 NOT NULL,
  `status_emoji` text DEFAULT '💻',
  `status_text` text,
  `is_online` integer DEFAULT 1 NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE cascade
);
