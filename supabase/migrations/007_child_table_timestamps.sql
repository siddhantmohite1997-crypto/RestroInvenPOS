-- Adds created_at/updated_at to modifiers, menu_item_modifier_groups, combo_deal_items, and
-- tax_components so the app can diff these tables against lastSyncedAt like every other synced
-- table, instead of resending every row in full on every sync regardless of what changed. These
-- mirror the columns just added to the equivalent local SQLite tables (see migration
-- 0010_marvelous_banshee.sql in src/db/migrations).
ALTER TABLE modifiers
  ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE menu_item_modifier_groups
  ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE combo_deal_items
  ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

ALTER TABLE tax_components
  ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
