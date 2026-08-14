import { thisMonth, thisWeek, today, yesterday } from '@/features/reports/dateRanges';

/** Formats using local date components — toISOString() would convert to UTC and shift the
 * calendar day whenever the test machine's timezone isn't UTC, which isn't what we're testing. */
function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('today', () => {
  it('spans from midnight to midnight the next day', () => {
    const range = today(new Date('2026-08-12T15:30:00'));
    expect(localDateString(range.start)).toBe('2026-08-12');
    expect(range.start.getHours()).toBe(0);
    expect(localDateString(range.end)).toBe('2026-08-13');
  });
});

describe('yesterday', () => {
  it('is the day before, spanning midnight to midnight', () => {
    const range = yesterday(new Date('2026-08-12T15:30:00'));
    expect(localDateString(range.start)).toBe('2026-08-11');
    expect(localDateString(range.end)).toBe('2026-08-12');
  });
});

describe('thisWeek', () => {
  it('starts on Monday for a mid-week date', () => {
    // 2026-08-12 is a Wednesday
    const range = thisWeek(new Date('2026-08-12T15:30:00'));
    expect(range.start.getDay()).toBe(1); // Monday
    expect(localDateString(range.start)).toBe('2026-08-10');
  });

  it('treats Sunday as the last day of its week, not the first', () => {
    // 2026-08-09 is a Sunday, belongs to the week starting 2026-08-03
    const range = thisWeek(new Date('2026-08-09T12:00:00'));
    expect(localDateString(range.start)).toBe('2026-08-03');
    expect(localDateString(range.end)).toBe('2026-08-10');
  });

  it('spans exactly 7 days', () => {
    const range = thisWeek(new Date('2026-08-12T15:30:00'));
    const diffDays = (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(7);
  });
});

describe('thisMonth', () => {
  it('spans the first of the month to the first of the next month', () => {
    const range = thisMonth(new Date('2026-08-12T15:30:00'));
    expect(localDateString(range.start)).toBe('2026-08-01');
    expect(localDateString(range.end)).toBe('2026-09-01');
  });

  it('rolls over correctly from December to January', () => {
    const range = thisMonth(new Date('2026-12-25T00:00:00'));
    expect(localDateString(range.start)).toBe('2026-12-01');
    expect(localDateString(range.end)).toBe('2027-01-01');
  });
});
