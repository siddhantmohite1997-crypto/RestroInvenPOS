import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { restaurants, users } from './restaurant';

/**
 * Append-only. Every bill edit, void, price change, and discount override writes a row here
 * (Phase 6 requirement). beforeJson/afterJson are opaque JSON snapshots of the changed entity.
 */
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  staffId: text('staff_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
