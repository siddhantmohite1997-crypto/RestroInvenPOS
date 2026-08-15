export type StaffRole = 'owner' | 'admin' | 'cashier';

/**
 * ASSUMPTION flagged for review: "large discount" thresholds aren't specified anywhere — a
 * cashier discounting 5% off a coffee is routine, but 50% off a full bill isn't. Picked
 * defaults (20% or a flat amount over ₹500) that a cashier can still apply, just with an
 * owner/admin PIN confirming it. Adjust to match actual house policy.
 */
export const LARGE_DISCOUNT_PERCENT_THRESHOLD = 20;
export const LARGE_DISCOUNT_FLAT_THRESHOLD = 500;

export function canEditPrices(role: StaffRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManageStaff(role: StaffRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canViewAuditLog(role: StaffRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function canVoidWithoutOverride(role: StaffRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function isLargeDiscount(discount: { type: 'flat' | 'percentage'; value: number }): boolean {
  if (discount.type === 'percentage') return discount.value > LARGE_DISCOUNT_PERCENT_THRESHOLD;
  return discount.value > LARGE_DISCOUNT_FLAT_THRESHOLD;
}

/** Whether applying this discount as `role` needs an owner/admin PIN to confirm. */
export function needsDiscountOverride(role: StaffRole, discount: { type: 'flat' | 'percentage'; value: number }): boolean {
  if (canVoidWithoutOverride(role)) return false;
  return isLargeDiscount(discount);
}

/** Voiding a bill always needs an owner/admin PIN when the acting staff is a cashier. */
export function needsVoidOverride(role: StaffRole): boolean {
  return !canVoidWithoutOverride(role);
}

/** Editing a price always needs an owner/admin PIN when the acting staff is a cashier. */
export function needsPriceEditOverride(role: StaffRole): boolean {
  return !canEditPrices(role);
}
