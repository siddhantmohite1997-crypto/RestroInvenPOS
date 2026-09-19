import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { restaurants } from './restaurant';
import { menuItems } from './menu';

/** A supplier a purchase bill can be attributed to. Deliberately light -- not a vendor-
 * management module, just enough identity to autocomplete against on future bills and to
 * capture a GST number from day one (retrofitting it onto already-logged bills later is worse
 * than asking for it once, up front). See the Purchase entry screen's match-or-create flow. */
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  phone: text('phone'),
  gstNumber: text('gst_number'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Raw stock the kitchen actually holds (e.g. "Paneer", unit "kg"). Quantity is stored in
 * whatever unit the restaurant picks at creation — there's no kg/g or l/ml conversion, so a
 * recipe's quantityRequired must be entered in this same unit (see recipeIngredients below). */
export const inventoryItems = sqliteTable('inventory_items', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  /** Freeform grouping label ("Meat", "Dairy", "Bakery/Bread", ...) so a long stock list can be
   * browsed by section instead of one flat alphabetical list. Nullable -- items created before
   * this existed, or never categorized, just fall under "Other" in the UI. */
  category: text('category'),
  unit: text('unit').notNull(),
  quantity: real('quantity').notNull().default(0),
  lowStockThreshold: real('low_stock_threshold'),
  costPerUnit: real('cost_per_unit'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** The header of a multi-item supplier bill -- "bought these N items from this supplier on
 * this date, for this total". Its line items live in inventoryPurchases (see purchaseId below);
 * this table exists so a bill can be browsed as one thing in Reports > Purchase Report, rather
 * than only ever appearing as N separate flat rows in the Daily Expense log. */
export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  supplierId: text('supplier_id').references(() => suppliers.id),
  staffId: text('staff_id').notNull(),
  purchasedAt: integer('purchased_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  totalCost: real('total_cost').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A logged restock event -- money actually spent on inventory on a specific date. Distinct
 * from inventoryItems.quantity (a running stock snapshot) and its costPerUnit (a reference
 * price for the *next* purchase) -- this table is the append-only history the Daily Expense
 * report sums over a date range. Editing "Quantity in stock" directly in the item editor (a
 * stocktake correction) intentionally does NOT write one of these; only the dedicated Restock
 * action does, so a manual quantity fix never gets miscounted as money spent. */
export const inventoryPurchases = sqliteTable('inventory_purchases', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  /** Set when this restock is one line of a multi-item purchase bill (see purchases above).
   * Null for a restock logged the old way, one item at a time via the Inventory item editor's
   * "Record Restock" section -- that's still fully supported and just isn't part of any bill. */
  purchaseId: text('purchase_id').references(() => purchases.id),
  quantity: real('quantity').notNull(),
  costPerUnit: real('cost_per_unit').notNull(),
  totalCost: real('total_cost').notNull(),
  staffId: text('staff_id').notNull(),
  /** When the restock actually happened -- defaults to now, but kept separate from createdAt so
   * a purchase entered a day late still counts against the day it was actually bought. */
  purchasedAt: integer('purchased_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Links a menu item to the inventory it consumes per serving. quantityRequired is in the
 * linked inventoryItem's own unit — no conversion is performed. A menu item with no rows here
 * is "unlinked": selling it never touches inventory, same as before this table existed. */
export const recipeIngredients = sqliteTable('recipe_ingredients', {
  id: text('id').primaryKey(),
  menuItemId: text('menu_item_id')
    .notNull()
    .references(() => menuItems.id),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  quantityRequired: real('quantity_required').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
