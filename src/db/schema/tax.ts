import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { restaurants } from './restaurant';

/**
 * A tax rule is a named slab (e.g. "GST 5%", "VAT 20%") attached to menu items.
 * It can have multiple components so region-specific splits (CGST 2.5% + SGST 2.5%)
 * still show as one rule but print as a itemized breakdown on the invoice.
 */
export const taxRules = sqliteTable('tax_rules', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  totalRatePercent: real('total_rate_percent').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** e.g. { label: 'CGST', ratePercent: 2.5 } + { label: 'SGST', ratePercent: 2.5 } under one taxRule. */
export const taxComponents = sqliteTable('tax_components', {
  id: text('id').primaryKey(),
  taxRuleId: text('tax_rule_id')
    .notNull()
    .references(() => taxRules.id),
  label: text('label').notNull(),
  ratePercent: real('rate_percent').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});
