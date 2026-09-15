CREATE TABLE `inventory_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`inventory_item_id` text NOT NULL,
	`quantity` real NOT NULL,
	`cost_per_unit` real NOT NULL,
	`total_cost` real NOT NULL,
	`staff_id` text NOT NULL,
	`purchased_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE no action
);
