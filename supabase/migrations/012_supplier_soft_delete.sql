-- Vendor CRUD (see the follow-up design spec) needs a way to remove a vendor from lists and
-- autocomplete without breaking existing purchase bills that reference it -- suppliers.id has
-- no ON DELETE behavior specified on purchases.supplier_id, so a hard delete would fail outright
-- for any vendor with purchase history. Soft-delete, matching inventory_items.is_active.
ALTER TABLE suppliers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
