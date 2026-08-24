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

/** One row per "Sync Now" attempt (manual or automatic) — a history for the Sync settings
 * screen, and the record that lets support/ops see whether auto-sync has actually been
 * running, not just that it's turned on. */
export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id').notNull(),
  triggeredBy: text('triggered_by').$type<'manual' | 'auto'>().notNull(),
  status: text('status').$type<'success' | 'error'>().notNull(),
  message: text('message'),
  pushedCountsJson: text('pushed_counts_json'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
});
