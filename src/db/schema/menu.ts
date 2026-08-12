import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { restaurants } from './restaurant';
import { taxRules } from './tax';

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const menuItems = sqliteTable('menu_items', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  categoryId: text('category_id')
    .notNull()
    .references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  price: real('price').notNull(),
  imageUri: text('image_uri'),
  taxRuleId: text('tax_rule_id').references(() => taxRules.id),
  isServiceChargeExempt: integer('is_service_charge_exempt', { mode: 'boolean' })
    .notNull()
    .default(false),
  isOutOfStock: integer('is_out_of_stock', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** e.g. "Add-ons", "Spice Level" — reusable, attached to items via menuItemModifierGroups. */
export const modifierGroups = sqliteTable('modifier_groups', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  selectionType: text('selection_type').$type<'single' | 'multiple'>().notNull().default('single'),
  isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(false),
  minSelections: integer('min_selections').notNull().default(0),
  maxSelections: integer('max_selections'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const modifiers = sqliteTable('modifiers', {
  id: text('id').primaryKey(),
  modifierGroupId: text('modifier_group_id')
    .notNull()
    .references(() => modifierGroups.id),
  name: text('name').notNull(),
  priceDelta: real('price_delta').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

/** Many-to-many: which modifier groups apply to which items, without duplicating menu entries. */
export const menuItemModifierGroups = sqliteTable(
  'menu_item_modifier_groups',
  {
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.menuItemId, t.modifierGroupId] })],
);

export const comboDeals = sqliteTable('combo_deals', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  price: real('price').notNull(),
  imageUri: text('image_uri'),
  taxRuleId: text('tax_rule_id').references(() => taxRules.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const comboDealItems = sqliteTable('combo_deal_items', {
  id: text('id').primaryKey(),
  comboDealId: text('combo_deal_id')
    .notNull()
    .references(() => comboDeals.id),
  menuItemId: text('menu_item_id')
    .notNull()
    .references(() => menuItems.id),
  quantity: integer('quantity').notNull().default(1),
  allowSubstitution: integer('allow_substitution', { mode: 'boolean' }).notNull().default(false),
});
