-- DEFAULT 0 (epoch) backfills existing rows as "already old" for sync-diffing purposes:
-- filterChangedSince only resends rows changed after lastSyncedAt, so a pre-existing row
-- stamped at epoch is correctly treated as already-synced rather than newly-changed. New rows
-- always get a real timestamp explicitly from the ORM's $defaultFn at insert time regardless of
-- this column default. SQLite requires some constant default to add a NOT NULL column to a
-- table that already has rows (drizzle-kit's generated statement omits it and fails at runtime).
ALTER TABLE `tax_components` ADD `created_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `combo_deal_items` ADD `created_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `menu_item_modifier_groups` ADD `created_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `modifiers` ADD `created_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `modifiers` ADD `updated_at` integer NOT NULL DEFAULT 0;