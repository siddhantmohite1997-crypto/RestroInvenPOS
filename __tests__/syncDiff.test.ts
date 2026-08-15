import { filterChangedSince } from '@/features/sync/syncDiff';

describe('filterChangedSince', () => {
  it('treats null lastSyncedAt as "never synced" and returns every row', () => {
    const rows = [
      { id: 'a', changedAt: new Date('2020-01-01') },
      { id: 'b', changedAt: new Date('2026-01-01') },
    ];
    expect(filterChangedSince(rows, null)).toEqual(rows);
  });

  it('returns only rows changed strictly after the cutoff', () => {
    const cutoff = new Date('2026-01-01T00:00:00Z');
    const rows = [
      { id: 'before', changedAt: new Date('2025-12-31T23:59:59Z') },
      { id: 'exact', changedAt: cutoff },
      { id: 'after', changedAt: new Date('2026-01-01T00:00:01Z') },
    ];

    const result = filterChangedSince(rows, cutoff);
    expect(result.map((r) => r.id)).toEqual(['after']);
  });

  it('returns an empty array when nothing changed since the cutoff', () => {
    const cutoff = new Date('2026-06-01');
    const rows = [{ id: 'a', changedAt: new Date('2026-01-01') }];
    expect(filterChangedSince(rows, cutoff)).toEqual([]);
  });
});
