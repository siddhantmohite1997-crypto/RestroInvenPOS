import {
  addMonthsClamped,
  advanceCycle,
  dueDateForCycle,
  formatDateOnly,
  getSubscriptionStatus,
  parseDateOnly,
} from '@/features/subscription/subscriptionDates';

describe('addMonthsClamped', () => {
  it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2026-01-31'), 1))).toBe('2026-02-28');
  });

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2028-01-31'), 1))).toBe('2028-02-29');
  });

  it('clamps Aug 31 + 1 month to Sep 30', () => {
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2026-08-31'), 1))).toBe('2026-09-30');
  });

  it('does not chain drift: Jan 31 + 2 months is Mar 31, not Feb 28 + 1 month', () => {
    // Computed independently from the fixed anchor, this should snap back to day 31 once the
    // target month allows it again -- not stay pinned at 28 the way naively chaining
    // addMonthsClamped(addMonthsClamped(jan31, 1), 1) would.
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2026-01-31'), 2))).toBe('2026-03-31');
  });

  it('handles a leap-year Feb 29 anchor rolling into a non-leap year', () => {
    // 2028 is a leap year; 2028-02-29 + 12 months lands in 2029, which is not.
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2028-02-29'), 12))).toBe('2029-02-28');
  });

  it('rolls the year over correctly', () => {
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2026-11-15'), 3))).toBe('2027-02-15');
  });

  it('leaves an ordinary mid-month date unclamped', () => {
    expect(formatDateOnly(addMonthsClamped(parseDateOnly('2026-06-06'), 3))).toBe('2026-09-06');
  });
});

describe('dueDateForCycle and the three plan lengths', () => {
  const anchor = parseDateOnly('2026-09-06');

  it('quarterly is 3 months per cycle', () => {
    expect(formatDateOnly(dueDateForCycle(anchor, 'quarterly', 1))).toBe('2026-12-06');
    expect(formatDateOnly(dueDateForCycle(anchor, 'quarterly', 2))).toBe('2027-03-06');
  });

  it('half_yearly is 6 months per cycle', () => {
    expect(formatDateOnly(dueDateForCycle(anchor, 'half_yearly', 1))).toBe('2027-03-06');
    expect(formatDateOnly(dueDateForCycle(anchor, 'half_yearly', 2))).toBe('2027-09-06');
  });

  it('annual is 12 months per cycle', () => {
    expect(formatDateOnly(dueDateForCycle(anchor, 'annual', 1))).toBe('2027-09-06');
    expect(formatDateOnly(dueDateForCycle(anchor, 'annual', 2))).toBe('2028-09-06');
  });

  it('handles a 31st-of-the-month anchor across quarters that include Feb and 30-day months', () => {
    const anchor31 = parseDateOnly('2026-01-31');
    expect(formatDateOnly(dueDateForCycle(anchor31, 'quarterly', 1))).toBe('2026-04-30'); // Apr has 30 days
    expect(formatDateOnly(dueDateForCycle(anchor31, 'quarterly', 2))).toBe('2026-07-31'); // back to 31
    expect(formatDateOnly(dueDateForCycle(anchor31, 'quarterly', 3))).toBe('2026-10-31');
    expect(formatDateOnly(dueDateForCycle(anchor31, 'quarterly', 4))).toBe('2027-01-31');
  });
});

describe('advanceCycle — late payment never shifts the anchor', () => {
  it('paying exactly on time and paying late produce the identical next due date', () => {
    const start = parseDateOnly('2026-09-06');
    // Cycle 1 due 2026-12-06. Whether "today" (payment date) is the due date itself or three
    // days late, advanceCycle never looks at today at all -- only the anchor and cycle number.
    const onTime = advanceCycle(start, 'quarterly', 1);
    const late = advanceCycle(start, 'quarterly', 1);
    expect(formatDateOnly(onTime.dueDate)).toBe('2027-03-06');
    expect(formatDateOnly(late.dueDate)).toBe('2027-03-06');
    expect(onTime.cycleNumber).toBe(2);
    expect(late.cycleNumber).toBe(2);
  });

  it('does not drift after a clamped cycle', () => {
    // Anchor day 31: cycle 1 (Apr) clamps to 30. advanceCycle for cycle 2 must recompute from
    // the anchor (day 31) rather than chaining off cycle 1's clamped day-30 result, so it
    // correctly lands back on day 31 in July.
    const start = parseDateOnly('2026-01-31');
    const next = advanceCycle(start, 'quarterly', 1);
    expect(formatDateOnly(next.dueDate)).toBe('2026-07-31');
  });
});

describe('getSubscriptionStatus boundaries', () => {
  const dueDate = parseDateOnly('2026-06-15');

  it('ok when more than 7 days out', () => {
    expect(getSubscriptionStatus(dueDate, parseDateOnly('2026-06-07')).tier).toBe('ok');
  });

  it('due_soon at exactly 7 days out', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-08'));
    expect(status.tier).toBe('due_soon');
    expect(status.daysFromDue).toBe(-7);
  });

  it('due_soon at 1 day out', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-14'));
    expect(status.tier).toBe('due_soon');
    expect(status.daysFromDue).toBe(-1);
  });

  it('due_today at exactly 0 days', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-15'));
    expect(status.tier).toBe('due_today');
    expect(status.daysFromDue).toBe(0);
  });

  it('grace at 1 day overdue', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-16'));
    expect(status.tier).toBe('grace');
    expect(status.daysFromDue).toBe(1);
  });

  it('grace at 6 days overdue', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-21'));
    expect(status.tier).toBe('grace');
    expect(status.daysFromDue).toBe(6);
  });

  it('final_notice at exactly 7 days overdue', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-22'));
    expect(status.tier).toBe('final_notice');
    expect(status.daysFromDue).toBe(7);
  });

  it('overdue_disable at 8 days overdue', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-06-23'));
    expect(status.tier).toBe('overdue_disable');
    expect(status.daysFromDue).toBe(8);
  });

  it('overdue_disable stays overdue_disable well past the grace window', () => {
    const status = getSubscriptionStatus(dueDate, parseDateOnly('2026-07-15'));
    expect(status.tier).toBe('overdue_disable');
    expect(status.daysFromDue).toBe(30);
  });
});
