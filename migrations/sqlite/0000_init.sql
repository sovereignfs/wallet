CREATE TABLE `account_stream` (
	`account_id` text PRIMARY KEY NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`mode` text DEFAULT 'normal' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `applied_mutation` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`seq` integer NOT NULL,
	`applied_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `credential` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`purpose` text NOT NULL,
	`sealed` text NOT NULL,
	`key_fingerprint` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credential_account_idx` ON `credential` (`account_id`);--> statement-breakpoint
CREATE INDEX `credential_key_idx` ON `credential` (`key_fingerprint`);--> statement-breakpoint
CREATE TABLE `entry` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`tier` text NOT NULL,
	`holder_device_id` text,
	`version` integer NOT NULL,
	`seq` integer NOT NULL,
	`wrapped_key` blob NOT NULL,
	`shape` blob,
	`body` blob,
	`file_count` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entry_account_seq_idx` ON `entry` (`account_id`,`seq`);--> statement-breakpoint
CREATE INDEX `entry_account_id_idx` ON `entry` (`account_id`,`id`);--> statement-breakpoint
CREATE TABLE `rate_bucket` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_bucket_window_idx` ON `rate_bucket` (`window_start`);--> statement-breakpoint
CREATE TABLE `vault` (
	`account_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`recipients` text NOT NULL,
	`header` blob NOT NULL,
	`vault_key_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
