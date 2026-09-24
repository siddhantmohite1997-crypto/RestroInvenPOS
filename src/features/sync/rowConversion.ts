import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

/** Converts one Postgres row (snake_case keys, as Supabase returns them) into the shape
 * Drizzle expects for this table (camelCase keys, proper JS types) by walking the table's own
 * column definitions rather than hardcoding a per-table field map. A cloud column with no local
 * counterpart (e.g. restaurant_id stamped onto child tables purely for cloud-side RLS) is
 * silently skipped; a local column absent from the cloud row (e.g. one added after this
 * restaurant was first synced) is left for its own `.default(...)` to fill in. */
export function snakeRowToDrizzle(table: SQLiteTable, snakeRow: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const result: Record<string, unknown> = {};
  for (const [camelKey, column] of Object.entries(columns)) {
    const dbName = column.name;
    if (!(dbName in snakeRow)) continue;
    const raw = snakeRow[dbName];
    if (raw === null || raw === undefined) {
      result[camelKey] = null;
    } else if (column.dataType === 'date') {
      result[camelKey] = new Date(raw as string | number);
    } else if (column.dataType === 'boolean') {
      result[camelKey] = Boolean(raw);
    } else {
      result[camelKey] = raw;
    }
  }
  return result;
}
