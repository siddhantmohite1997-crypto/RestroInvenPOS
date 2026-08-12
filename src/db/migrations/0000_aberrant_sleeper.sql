CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`state` text,
	`postal_code` text,
	`country` text DEFAULT 'IN' NOT NULL,
	`phone` text,
	`email` text,
	`tax_id_label` text DEFAULT 'GSTIN' NOT NULL,
	`tax_id` text,
	`currency_code` text DEFAULT 'INR' NOT NULL,
	`currency_symbol` text DEFAULT '₹' NOT NULL,
	`logo_uri` text,
	`invoice_footer_text` text,
	`invoice_prefix` text DEFAULT 'INV' NOT NULL,
	`next_invoice_sequence` integer DEFAULT 1 NOT NULL,
	`service_charge_enabled` integer DEFAULT false NOT NULL,
	`service_charge_percent` real DEFAULT 0 NOT NULL,
	`rounding_rule` text DEFAULT 'nearest_1' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`pin_salt` text NOT NULL,
	`role` text DEFAULT 'cashier' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tax_components` (
	`id` text PRIMARY KEY NOT NULL,
	`tax_rule_id` text NOT NULL,
	`label` text NOT NULL,
	`rate_percent` real NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`tax_rule_id`) REFERENCES `tax_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tax_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`total_rate_percent` real NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `combo_deal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`combo_deal_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`allow_substitution` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`combo_deal_id`) REFERENCES `combo_deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `combo_deals` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`price` real NOT NULL,
	`image_uri` text,
	`tax_rule_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_rule_id`) REFERENCES `tax_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `menu_item_modifier_groups` (
	`menu_item_id` text NOT NULL,
	`modifier_group_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`menu_item_id`, `modifier_group_id`),
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` real NOT NULL,
	`image_uri` text,
	`tax_rule_id` text,
	`is_service_charge_exempt` integer DEFAULT false NOT NULL,
	`is_out_of_stock` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tax_rule_id`) REFERENCES `tax_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `modifier_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`selection_type` text DEFAULT 'single' NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`min_selections` integer DEFAULT 0 NOT NULL,
	`max_selections` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `modifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`modifier_group_id` text NOT NULL,
	`name` text NOT NULL,
	`price_delta` real DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`modifier_group_id`) REFERENCES `modifier_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dining_tables` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer,
	`status` text DEFAULT 'free' NOT NULL,
	`current_order_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`order_item_id` text,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`amount_applied` real NOT NULL,
	`reason` text,
	`coupon_code` text,
	`applied_by_staff_id` text NOT NULL,
	`approved_by_staff_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`applied_by_staff_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by_staff_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_item_modifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`modifier_id` text,
	`name_snapshot` text NOT NULL,
	`price_delta_snapshot` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modifier_id`) REFERENCES `modifiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text,
	`combo_deal_id` text,
	`name_snapshot` text NOT NULL,
	`unit_price_snapshot` real NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`line_subtotal` real NOT NULL,
	`line_discount_total` real DEFAULT 0 NOT NULL,
	`line_tax_total` real DEFAULT 0 NOT NULL,
	`notes` text,
	`is_voided` integer DEFAULT false NOT NULL,
	`void_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`combo_deal_id`) REFERENCES `combo_deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`invoice_number` text,
	`table_id` text,
	`order_type` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`opened_by_staff_id` text NOT NULL,
	`customer_name` text,
	`customer_phone` text,
	`subtotal` real DEFAULT 0 NOT NULL,
	`discount_total` real DEFAULT 0 NOT NULL,
	`tax_total` real DEFAULT 0 NOT NULL,
	`service_charge_total` real DEFAULT 0 NOT NULL,
	`rounding_adjustment` real DEFAULT 0 NOT NULL,
	`grand_total` real DEFAULT 0 NOT NULL,
	`amount_paid` real DEFAULT 0 NOT NULL,
	`notes` text,
	`parked_at` integer,
	`billed_at` integer,
	`paid_at` integer,
	`voided_at` integer,
	`void_reason` text,
	`voided_by_staff_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`table_id`) REFERENCES `dining_tables`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opened_by_staff_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by_staff_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`mode` text NOT NULL,
	`amount` real NOT NULL,
	`reference` text,
	`received_by_staff_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`received_by_staff_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`synced_at` integer
);
