CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`triggered_by` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`pushed_counts_json` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
