export interface TimestampedRow {
  id: string;
  /** The most relevant timestamp for change detection — updatedAt where the table has one, createdAt otherwise. */
  changedAt: Date;
}

/**
 * Selects rows changed after `lastSyncedAt`. `null` means "never synced", so everything counts
 * as changed — the first sync is a full push, not a no-op.
 */
export function filterChangedSince<T extends TimestampedRow>(rows: T[], lastSyncedAt: Date | null): T[] {
  if (lastSyncedAt === null) return rows;
  return rows.filter((row) => row.changedAt.getTime() > lastSyncedAt.getTime());
}
