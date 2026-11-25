CREATE TABLE `keyring` (
	`account_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`wrapped_root` blob NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `epoch`)
);
