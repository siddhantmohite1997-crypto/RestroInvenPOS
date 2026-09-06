export type SubscriptionPlan = 'quarterly' | 'half_yearly' | 'annual';

export const PLAN_MONTHS: Record<SubscriptionPlan, number> = {
  quarterly: 3,
  half_yearly: 6,
  annual: 12,
};

const GRACE_DAYS = 7;

/** Adds `months` calendar months to `date`, clamping the result to the last valid day of the
 * target month (Jan 31 + 1 month -> Feb 28/29, not an overflowed early-March date -- the naive
 * `Date.setMonth` approach gets this wrong). All math is done in UTC calendar components so
 * it's pure date arithmetic with no timezone drift -- callers should pass dates whose UTC Y/M/D
 * already represent the intended calendar date (e.g. built via `new Date(Date.UTC(y, m, d))`,
 * or a `YYYY-MM-DD` string parsed with `parseDateOnly` below -- never a local-time `Date` that
 * could land on a different calendar day once read back in UTC). */
export function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = month + months;
  // Date.UTC(y, m, 0) is "the day before the 1st of month m" -- i.e. the last day of month m-1,
  // which normalizes across year rollover for free (targetMonthIndex can be well outside 0-11).
  const daysInTargetMonth = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  return new Date(Date.UTC(year, targetMonthIndex, clampedDay));
}

/** Parses a `YYYY-MM-DD` string (as Postgres DATE columns round-trip through Supabase) into a
 * UTC-midnight Date, so it's safe to feed straight into the rest of this module. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface SubscriptionCycle {
  cycleNumber: number;
  dueDate: Date;
}

/** The due date for a given 1-indexed cycle, counted from `startDate`. Cycle 1 is the first
 * payment due (`startDate` + one plan period) -- a restaurant pays up front for its first
 * period at registration, so there's no "cycle 0"/immediately-due date. */
export function dueDateForCycle(startDate: Date, plan: SubscriptionPlan, cycleNumber: number): Date {
  return addMonthsClamped(startDate, PLAN_MONTHS[plan] * cycleNumber);
}

/** Finds the first cycle (>=1) whose due date is on or after `today`. Used the first time a
 * plan is set (or changed) on a restaurant, however far in the past its start date is -- a
 * restaurant that registered two years ago and is only just having its plan configured now
 * lands on its current real cycle, not cycle 1. Bounded to a sane number of iterations (a
 * 100-year-old start date on the shortest plan is ~400 cycles) so a bad input can't spin. */
export function computeCurrentCycle(startDate: Date, plan: SubscriptionPlan, today: Date): SubscriptionCycle {
  let cycleNumber = 1;
  let dueDate = dueDateForCycle(startDate, plan, cycleNumber);
  let guard = 0;
  while (dueDate < today && guard < 5000) {
    cycleNumber += 1;
    dueDate = dueDateForCycle(startDate, plan, cycleNumber);
    guard += 1;
  }
  return { cycleNumber, dueDate };
}

/** The next cycle after the one that was just paid. Always recomputed from the fixed
 * `startDate` at `(currentCycleNumber + 1) * planMonths` -- NEVER by adding another plan period
 * on top of the previous due date. Chaining off the previous due date would let one clamped
 * month (e.g. an anchor of the 31st landing on Feb 28) permanently drag every later cycle down
 * to day 28/30 instead of returning to 31 once the month allows it again; recomputing from the
 * anchor every time avoids that drift entirely. This is also what makes a late payment (paid
 * Dec 9 for a Dec 6 due date) still land the next cycle on Mar 6, not Mar 9 -- "today" and the
 * actual payment date never enter this calculation at all. */
export function advanceCycle(startDate: Date, plan: SubscriptionPlan, currentCycleNumber: number): SubscriptionCycle {
  const cycleNumber = currentCycleNumber + 1;
  return { cycleNumber, dueDate: dueDateForCycle(startDate, plan, cycleNumber) };
}

export type SubscriptionTier = 'ok' | 'due_soon' | 'due_today' | 'grace' | 'final_notice' | 'overdue_disable';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  /** Negative = days until due, 0 = due today, positive = days overdue. */
  daysFromDue: number;
  /** Empty for 'ok' -- callers treat 'ok' as "nothing to show", not a real message. */
  message: string;
}

/**
 * Buckets how far `today` is from `nextDueDate` into the reminder tiers a caller can act on:
 * - ok:              more than GRACE_DAYS days until due, or already renewed -- no reminder.
 * - due_soon:         1-7 days until due.
 * - due_today:        due today.
 * - grace:            1-6 days overdue -- still enabled, gentle reminder.
 * - final_notice:     exactly 7 days overdue -- last day before disable takes effect.
 * - overdue_disable:  8+ days overdue -- the daily cron should already have disabled this
 *                      restaurant by now; this tier mostly exists for status display/testing.
 * Dates are compared as pure calendar days (UTC midnight), not instants, so same-day always
 * reads as exactly 0 regardless of what time of day `today` was constructed at.
 */
export function getSubscriptionStatus(nextDueDate: Date, today: Date): SubscriptionStatus {
  const msPerDay = 24 * 60 * 60 * 1000;
  const dueUtc = Date.UTC(nextDueDate.getUTCFullYear(), nextDueDate.getUTCMonth(), nextDueDate.getUTCDate());
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysFromDue = Math.round((todayUtc - dueUtc) / msPerDay);
  const dateLabel = formatDateOnly(nextDueDate);
  const plural = (n: number) => (n === 1 ? '' : 's');

  if (daysFromDue < 0) {
    const daysLeft = -daysFromDue;
    if (daysLeft > GRACE_DAYS) return { tier: 'ok', daysFromDue, message: '' };
    return {
      tier: 'due_soon',
      daysFromDue,
      message: `Subscription payment is due on ${dateLabel} (${daysLeft} day${plural(daysLeft)} left).`,
    };
  }
  if (daysFromDue === 0) {
    return { tier: 'due_today', daysFromDue, message: `Subscription payment is due today (${dateLabel}).` };
  }
  if (daysFromDue < GRACE_DAYS) {
    return {
      tier: 'grace',
      daysFromDue,
      message: `Subscription payment was due on ${dateLabel} and is now ${daysFromDue} day${plural(
        daysFromDue,
      )} overdue. Please renew to avoid service interruption.`,
    };
  }
  if (daysFromDue === GRACE_DAYS) {
    return {
      tier: 'final_notice',
      daysFromDue,
      message: `Final notice: subscription payment is ${GRACE_DAYS} days overdue. The POS will be disabled after 12am tonight unless payment is made.`,
    };
  }
  return {
    tier: 'overdue_disable',
    daysFromDue,
    message: `Subscription payment is ${daysFromDue} days overdue. The POS has been disabled.`,
  };
}
