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
