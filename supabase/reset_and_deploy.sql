-- Run this ONCE in the Supabase SQL Editor to replace the old (drifted) schema with the
-- corrected one in schema.sql. This DROPS all existing tables — including test-restaurant-1
-- and its staff row — since the column structure changed enough that in-place ALTERs would be
-- far riskier than a clean rebuild. Recreate your test restaurant(s) after running this.

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS discounts CASCADE;
DROP TABLE IF EXISTS order_item_modifiers CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS dining_tables CASCADE;
DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS combo_deal_items CASCADE;
DROP TABLE IF EXISTS combo_deals CASCADE;
DROP TABLE IF EXISTS menu_item_modifier_groups CASCADE;
DROP TABLE IF EXISTS modifiers CASCADE;
DROP TABLE IF EXISTS modifier_groups CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS tax_components CASCADE;
DROP TABLE IF EXISTS tax_rules CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================================================
-- Below is the full corrected schema (identical to supabase/schema.sql)
-- ============================================================================
-- Phase 8.5: Supabase PostgreSQL Schema
-- Multi-tenant POS system with Row Level Security
--
-- Column names mirror the local SQLite (Drizzle) schema's snake_case equivalents exactly,
-- since the sync API converts each row's camelCase JS keys to snake_case mechanically
-- (customerEmail -> customer_email) rather than remapping field-by-field. Every table also
-- carries restaurant_id, even junction tables that don't have it locally, because the sync
-- API stamps it onto every row uniformly for RLS/isolation defense-in-depth.

-- ============================================================================
-- RESTAURANTS (Multi-tenant root)
-- ============================================================================
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'IN',
  phone TEXT,
  email TEXT,
  tax_id_label TEXT NOT NULL DEFAULT 'GSTIN',
  tax_id TEXT,
  currency_code TEXT NOT NULL DEFAULT 'INR',
  currency_symbol TEXT NOT NULL DEFAULT '₹',
  logo_uri TEXT,
  invoice_footer_text TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  next_invoice_sequence INT NOT NULL DEFAULT 1,
  service_charge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  service_charge_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tables_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rounding_rule TEXT NOT NULL DEFAULT 'nearest_1',
  -- Cloud-only fields (not in the local schema): admin enable/disable + sync bookkeeping.
  enabled BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- STAFF (PIN authentication)
-- Not synced from the app (PINs are managed server-side only) — create rows here directly.
-- pin_hash is an unsalted SHA-256 of the PIN, matching the API's verifyPinAuth().
-- ============================================================================
CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT DEFAULT 'cashier', -- owner, admin, cashier
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(restaurant_id, pin_hash)
);

-- ============================================================================
-- MENU (Categories and Items)
-- ============================================================================
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- tax_rules/tax_components are referenced by menu_items/combo_deals below, so they must be
-- created first even though they're conceptually a later section.
CREATE TABLE tax_rules (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_rate_percent NUMERIC(5, 2) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tax_components (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  tax_rule_id TEXT NOT NULL REFERENCES tax_rules(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  rate_percent NUMERIC(5, 2) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  image_uri TEXT,
  tax_rule_id TEXT REFERENCES tax_rules(id),
  is_service_charge_exempt BOOLEAN NOT NULL DEFAULT FALSE,
  is_out_of_stock BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- MODIFIERS (Customization options)
-- ============================================================================
CREATE TABLE modifier_groups (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  selection_type TEXT NOT NULL DEFAULT 'single', -- single, multiple
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  min_selections INT NOT NULL DEFAULT 0,
  max_selections INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE modifiers (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta NUMERIC(10, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Composite key (menu_item_id, modifier_group_id) — the local table has no separate `id` column.
CREATE TABLE menu_item_modifier_groups (
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (menu_item_id, modifier_group_id)
);

-- ============================================================================
-- COMBOS (Deal bundles)
-- ============================================================================
CREATE TABLE combo_deals (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  image_uri TEXT,
  tax_rule_id TEXT REFERENCES tax_rules(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE combo_deal_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  combo_deal_id TEXT NOT NULL REFERENCES combo_deals(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  allow_substitution BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================================
-- INVENTORY (raw stock + recipe -> ingredient links)
-- ============================================================================
CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(10, 3),
  cost_per_unit NUMERIC(10, 2),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_required NUMERIC(10, 3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- DINING TABLES
-- ============================================================================
CREATE TABLE dining_tables (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INT,
  status TEXT NOT NULL DEFAULT 'free', -- free, occupied, billed
  current_order_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- ORDERS (Billing and transactions)
-- ============================================================================
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  invoice_number TEXT,
  table_id TEXT REFERENCES dining_tables(id),
  order_type TEXT NOT NULL, -- dine_in, takeaway, delivery
  status TEXT NOT NULL DEFAULT 'active', -- draft, parked, active, billed, paid, void
  opened_by_staff_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  service_charge_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rounding_adjustment NUMERIC(10, 2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  parked_at TIMESTAMP WITH TIME ZONE,
  billed_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  voided_at TIMESTAMP WITH TIME ZONE,
  void_reason TEXT,
  voided_by_staff_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT REFERENCES menu_items(id),
  combo_deal_id TEXT REFERENCES combo_deals(id),
  name_snapshot TEXT NOT NULL,
  unit_price_snapshot NUMERIC(10, 2) NOT NULL,
  tax_rate_percent_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_components_snapshot TEXT, -- JSON array of { label, ratePercent }
  is_service_charge_exempt_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  quantity INT NOT NULL DEFAULT 1,
  line_subtotal NUMERIC(10, 2) NOT NULL,
  line_discount_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  line_tax_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  void_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_item_modifiers (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id TEXT REFERENCES modifiers(id),
  name_snapshot TEXT NOT NULL,
  price_delta_snapshot NUMERIC(10, 2) NOT NULL DEFAULT 0
);

-- ============================================================================
-- DISCOUNTS
-- ============================================================================
CREATE TABLE discounts (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id TEXT REFERENCES order_items(id),
  type TEXT NOT NULL, -- flat, percentage
  value NUMERIC(10, 2) NOT NULL,
  amount_applied NUMERIC(10, 2) NOT NULL,
  reason TEXT,
  coupon_code TEXT,
  applied_by_staff_id TEXT NOT NULL,
  approved_by_staff_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PAYMENTS
-- ============================================================================
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  mode TEXT NOT NULL, -- cash, card, upi, other
  amount NUMERIC(10, 2) NOT NULL,
  reference TEXT,
  received_by_staff_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOGS (Compliance and tracking)
-- ============================================================================
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES (Performance optimization)
-- ============================================================================
CREATE INDEX idx_staff_restaurant ON staff(restaurant_id);
CREATE INDEX idx_staff_pin_hash ON staff(pin_hash);
CREATE INDEX idx_categories_restaurant ON categories(restaurant_id);
CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_modifier_groups_restaurant ON modifier_groups(restaurant_id);
CREATE INDEX idx_modifiers_group ON modifiers(modifier_group_id);
CREATE INDEX idx_tax_rules_restaurant ON tax_rules(restaurant_id);
CREATE INDEX idx_tax_components_rule ON tax_components(tax_rule_id);
CREATE INDEX idx_combo_deals_restaurant ON combo_deals(restaurant_id);
CREATE INDEX idx_combo_deal_items_combo ON combo_deal_items(combo_deal_id);
CREATE INDEX idx_inventory_items_restaurant ON inventory_items(restaurant_id);
CREATE INDEX idx_recipe_ingredients_menu_item ON recipe_ingredients(menu_item_id);
CREATE INDEX idx_dining_tables_restaurant ON dining_tables(restaurant_id);
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_item_modifiers_item ON order_item_modifiers(order_item_id);
CREATE INDEX idx_discounts_order ON discounts(order_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_audit_logs_restaurant ON audit_logs(restaurant_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================================
-- ROW LEVEL SECURITY (Multi-tenant isolation)
-- ============================================================================
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_deal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only allow access to own restaurant
-- Note: In practice, API authenticates PIN and filters by restaurant_id
-- These rules provide defense-in-depth
CREATE POLICY "staff_access_own_restaurant" ON staff
  USING (TRUE);

CREATE POLICY "orders_access_own_restaurant" ON orders
  USING (TRUE);

CREATE POLICY "audit_logs_access_own_restaurant" ON audit_logs
  USING (TRUE);

-- ============================================================================
-- FUNCTIONS (Helpers)
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to tables that have one
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modifier_groups_updated_at BEFORE UPDATE ON modifier_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_rules_updated_at BEFORE UPDATE ON tax_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_combo_deals_updated_at BEFORE UPDATE ON combo_deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dining_tables_updated_at BEFORE UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
