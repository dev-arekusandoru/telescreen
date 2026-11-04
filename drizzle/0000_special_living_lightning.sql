CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`secret_encrypted` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `api_token` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_token_token_hash_unique` ON `api_token` (`token_hash`);--> statement-breakpoint
CREATE TABLE `calendar` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`writable` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`member_id` text,
	`sync_token` text,
	`ctag` text,
	`last_synced_at` text,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_account_remote_idx` ON `calendar` (`account_id`,`remote_id`);--> statement-breakpoint
CREATE TABLE `chore_occurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`chore_id` text NOT NULL,
	`index_n` integer NOT NULL,
	`due_date` text NOT NULL,
	`assignee_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_by` text,
	`completed_at` text,
	FOREIGN KEY (`chore_id`) REFERENCES `chore`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`completed_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_occurrence_chore_index_idx` ON `chore_occurrence` (`chore_id`,`index_n`);--> statement-breakpoint
CREATE INDEX `chore_occurrence_due_idx` ON `chore_occurrence` (`due_date`);--> statement-breakpoint
CREATE TABLE `chore` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`notes` text,
	`recurrence_json` text NOT NULL,
	`assignment` text NOT NULL,
	`member_ids_json` text DEFAULT '[]' NOT NULL,
	`due_time` text,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`etag` text,
	`series_id` text,
	`recurrence_id` text,
	`start_utc` text NOT NULL,
	`end_utc` text NOT NULL,
	`start_tz` text,
	`all_day` integer DEFAULT false NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`location` text,
	`notes` text,
	`rrule` text,
	`raw_ics` text,
	`deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendar`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_calendar_start_idx` ON `event` (`calendar_id`,`start_utc`);--> statement-breakpoint
CREATE INDEX `event_series_idx` ON `event` (`series_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_calendar_remote_idx` ON `event` (`calendar_id`,`remote_id`,`recurrence_id`);--> statement-breakpoint
CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	`week_start` integer DEFAULT 0 NOT NULL,
	`theme_default` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`color_token` text NOT NULL,
	`initial` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_household_idx` ON `member` (`household_id`,`sort`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL
);
