-- Freeform grouping label for inventory items (e.g. "Meat", "Dairy", "Bakery/Bread") so the
-- Inventory screen can show sections instead of one flat alphabetical list. See the comment on
-- src/db/schema/inventory.ts's `category` column for the same reasoning -- nullable, since
-- existing items and anything never categorized just falls under "Other" in the UI.
ALTER TABLE inventory_items ADD COLUMN category TEXT;
