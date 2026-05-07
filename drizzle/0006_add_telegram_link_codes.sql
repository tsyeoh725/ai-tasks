CREATE TABLE `telegram_link_codes` (
  `code` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `telegram_link_codes_user_idx` ON `telegram_link_codes` (`user_id`);
--> statement-breakpoint
CREATE INDEX `telegram_link_codes_expires_idx` ON `telegram_link_codes` (`expires_at`);
