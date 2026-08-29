import {
  canEditPrices,
  canManageStaff,
  canViewAuditLog,
  canVoidWithoutOverride,
  isLargeDiscount,
  needsDiscountOverride,
  needsPriceEditOverride,
  needsVoidOverride,
} from '@/features/auth/permissions';

describe('role capability checks', () => {
  it('grants owner and admin (labeled "Captain") the same order-level capabilities', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(canEditPrices(role)).toBe(true);
      expect(canVoidWithoutOverride(role)).toBe(true);
    }
  });

  it('denies a cashier (labeled "Waiter") the elevated capabilities', () => {
    expect(canEditPrices('cashier')).toBe(false);
    expect(canManageStaff('cashier')).toBe(false);
    expect(canVoidWithoutOverride('cashier')).toBe(false);
  });

  it('restricts staff management and audit log to owner only, not admin/Captain', () => {
    expect(canManageStaff('owner')).toBe(true);
    expect(canManageStaff('admin')).toBe(false);
    expect(canViewAuditLog('owner')).toBe(true);
    expect(canViewAuditLog('admin')).toBe(false);
  });
});

describe('isLargeDiscount', () => {
  it('treats a percentage discount above the threshold as large', () => {
    expect(isLargeDiscount({ type: 'percentage', value: 21 })).toBe(true);
    expect(isLargeDiscount({ type: 'percentage', value: 20 })).toBe(false);
  });

  it('treats a flat discount above the threshold as large', () => {
    expect(isLargeDiscount({ type: 'flat', value: 501 })).toBe(true);
    expect(isLargeDiscount({ type: 'flat', value: 500 })).toBe(false);
  });
});

describe('needsDiscountOverride', () => {
  it('never requires override for owner/admin regardless of discount size', () => {
    expect(needsDiscountOverride('owner', { type: 'percentage', value: 99 })).toBe(false);
    expect(needsDiscountOverride('admin', { type: 'flat', value: 99999 })).toBe(false);
  });

  it('requires override for a cashier applying a large discount', () => {
    expect(needsDiscountOverride('cashier', { type: 'percentage', value: 50 })).toBe(true);
  });

  it('does not require override for a cashier applying a small discount', () => {
    expect(needsDiscountOverride('cashier', { type: 'percentage', value: 5 })).toBe(false);
  });
});

describe('needsVoidOverride / needsPriceEditOverride', () => {
  it('requires override only for cashiers', () => {
    expect(needsVoidOverride('cashier')).toBe(true);
    expect(needsVoidOverride('owner')).toBe(false);
    expect(needsPriceEditOverride('cashier')).toBe(true);
    expect(needsPriceEditOverride('admin')).toBe(false);
  });
});
