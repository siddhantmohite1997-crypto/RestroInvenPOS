CREATE TABLE `pending_inventory_deltas` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	`delta` real,
	`set_absolute` real,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`synced_at` integer,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
