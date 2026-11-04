CREATE TABLE `music_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'spotify' NOT NULL,
	`label` text NOT NULL,
	`secret_encrypted` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text
);
