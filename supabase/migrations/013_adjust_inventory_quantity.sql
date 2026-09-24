-- Atomic, server-side delta application for inventory quantity -- see POST
-- /inventory/adjust-stock in api/src/index.ts, the only caller. Runs entirely inside Postgres
-- in one statement so two concurrent calls for the same item can never race each other into a
-- lost update the way a read-then-write from application code could.
CREATE OR REPLACE FUNCTION adjust_inventory_quantity(
  p_inventory_item_id TEXT,
  p_restaurant_id TEXT,
  p_delta NUMERIC
)
RETURNS TABLE(new_quantity NUMERIC) AS $$
BEGIN
  RETURN QUERY
  UPDATE inventory_items
  SET quantity = ROUND((quantity + p_delta)::numeric, 3),
      updated_at = NOW()
  WHERE id = p_inventory_item_id AND restaurant_id = p_restaurant_id
  RETURNING inventory_items.quantity;
END;
$$ LANGUAGE plpgsql;
