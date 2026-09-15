import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { restaurants } from './restaurant';
import { menuItems } from './menu';

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
