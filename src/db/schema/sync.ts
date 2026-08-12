import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Change-log for the manual "Sync Now" flow (Phase 7). Every insert/update/delete on a
 * syncable table appends one row here; syncing walks pending rows oldest-first and pushes
 * them to Firestore. Kept as an explicit queue (rather than dirty flags on every table) so
 * sync logic stays in one place and survives schema growth.
 */
export const syncQueue = sqliteTable('sync_queue', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  rowId: text('row_id').notNull(),
  operation: text('operation').$type<'insert' | 'update' | 'delete'>().notNull(),
  payloadJson: text('payload_json'),
  status: text('status').$type<'pending' | 'synced' | 'failed'>().notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});
