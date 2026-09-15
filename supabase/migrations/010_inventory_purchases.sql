-- A logged restock event -- money actually spent on inventory on a specific date. Distinct from
-- inventory_items.quantity (a running stock snapshot) and its cost_per_unit (a reference price
-- for the *next* purchase) -- this table is the append-only history the Daily Expense report
-- sums over a date range. Editing "Quantity in stock" directly in the item editor (a stocktake
-- correction) intentionally does NOT write one of these; only the dedicated Restock action does,
-- so a manual quantity fix never gets miscounted as money spent. See src/db/schema/inventory.ts.
CREATE TABLE inventory_purchases (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(10, 3) NOT NULL,
  cost_per_unit NUMERIC(10, 2) NOT NULL,
  total_cost NUMERIC(10, 2) NOT NULL,
  staff_id TEXT NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_inventory_purchases_restaurant_date
  ON inventory_purchases (restaurant_id, purchased_at);
