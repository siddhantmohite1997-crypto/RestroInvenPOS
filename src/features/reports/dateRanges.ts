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
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}
