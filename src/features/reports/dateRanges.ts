import type { DateRange } from './reportService';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function today(now = new Date()): DateRange {
  const start = startOfDay(now);
  return { start, end: addDays(start, 1) };
}

export function yesterday(now = new Date()): DateRange {
  const start = addDays(startOfDay(now), -1);
  return { start, end: addDays(start, 1) };
}

/** Monday-start week containing `now`. */
export function thisWeek(now = new Date()): DateRange {
  const start = startOfDay(now);
  const day = start.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const weekStart = addDays(start, -diffToMonday);
  return { start: weekStart, end: addDays(weekStart, 7) };
}

export function thisMonth(now = new Date()): DateRange {
  return monthsAgo(0, now);
}

/** `n=0` is the current calendar month, `n=1` is the month before that, and so on — used by
 * the "Pick a month" control on report screens to look back further than "This Month". JS's
 * Date constructor rolls a negative month index back into the correct prior year on its own
 * (e.g. month index -1 for January becomes December of the previous year), so this needs no
 * special-casing for a year boundary. */
export function monthsAgo(n: number, now = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  return { start, end };
}

/** Short display label for a monthsAgo() offset, e.g. "Aug 2026" — used both by the
 * MonthPicker component's option list and by any screen that needs to show which month is
 * currently selected. */
export function monthLabel(n: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
