// Intentional duplicate of src/features/subscription/subscriptionDates.ts (the Expo app) and
// Web App/server/src/subscriptionDates.ts (the admin panel server) -- this is its own
// independently-deployed Node project (rootDir: ./src, deployed separately to Railway) with no
// shared package between the three. The canonical, fully unit-tested version lives in the POS
// app's own repo tree; keep this copy in sync with it if the logic ever changes. Only the
// status-tier computation is needed here -- this API never writes subscription fields, it only
// reports them to the mobile app's checkOnly probe.

export type SubscriptionPlan = 'quarterly' | 'half_yearly' | 'annual';

const GRACE_DAYS = 7;

export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type SubscriptionTier = 'ok' | 'due_soon' | 'due_today' | 'grace' | 'final_notice' | 'overdue_disable';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  daysFromDue: number;
  message: string;
}

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
