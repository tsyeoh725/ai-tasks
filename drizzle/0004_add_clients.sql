-- Add clients + invoices + payments + links tables, and clientId FK on projects

CREATE TABLE `clients` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `team_id` text,
  `name` text NOT NULL,
  `logo_url` text,
  `brief` text,
  `brand_color` text DEFAULT '#99ff33',
  `contact_name` text,
  `contact_email` text,
  `contact_phone` text,
  `website` text,
  `industry` text,
  `billing_address` text,
  `tax_id` text,
  `currency` text DEFAULT 'USD',
  `status` text DEFAULT 'active' NOT NULL,
  `custom_fields` text DEFAULT '{}',
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_invoices` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL,
  `number` text NOT NULL,
  `title` text,
  `amount` real NOT NULL,
  `currency` text DEFAULT 'USD' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `issued_date` integer,
  `due_date` integer,
  `paid_date` integer,
  `items` text DEFAULT '[]',
  `notes` text,
  `file_path` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_payments` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL,
  `invoice_id` text,
  `amount` real NOT NULL,
  `currency` text DEFAULT 'USD' NOT NULL,
  `payment_date` integer NOT NULL,
  `reference` text,
  `source` text DEFAULT 'manual' NOT NULL,
  `raw_description` text,
  `matched` integer DEFAULT false NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`invoice_id`) REFERENCES `client_invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `client_links` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL,
  `platform` text NOT NULL,
  `label` text NOT NULL,
  `url` text NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `client_id` text REFERENCES clients(id);
