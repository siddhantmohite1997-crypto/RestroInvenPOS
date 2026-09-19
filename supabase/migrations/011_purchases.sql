-- A supplier a purchase bill can be attributed to. Deliberately light -- not a vendor-
-- management module, just enough identity to autocomplete against on future bills and to
-- capture a GST number from day one. See src/db/schema/inventory.ts's `suppliers` comment.
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  gst_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- The header of a multi-item supplier bill. Its line items live in inventory_purchases (see
-- the purchase_id column added below). See src/db/schema/inventory.ts's `purchases` comment.
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id),
  staff_id TEXT NOT NULL,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  total_cost NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Nullable and additive: every restock already logged via the old single-item "Record Restock"
-- flow keeps this NULL (not part of any bill, which is accurate). See
-- src/db/schema/inventory.ts's `purchaseId` comment on inventoryPurchases.
ALTER TABLE inventory_purchases ADD COLUMN purchase_id TEXT REFERENCES purchases(id);

CREATE INDEX idx_purchases_restaurant_date ON purchases (restaurant_id, purchased_at);
