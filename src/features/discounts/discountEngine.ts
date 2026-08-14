import { round2 } from '@/features/tax/taxEngine';

export type DiscountType = 'flat' | 'percentage';

export interface DiscountInput {
  type: DiscountType;
  value: number;
}

export interface DiscountableLine {
  id: string;
  lineSubtotal: number;
}

/** A flat discount can't exceed the amount it's applied to; a bad coupon shouldn't produce a negative bill. */
export function calculateDiscountAmount(base: number, discount: DiscountInput): number {
  if (discount.type === 'flat') {
    return round2(Math.min(Math.max(discount.value, 0), base));
  }
  const clampedPercent = Math.min(Math.max(discount.value, 0), 100);
  return round2(base * (clampedPercent / 100));
}

/**
 * Spreads a bill-level discount across order lines proportionally to each line's subtotal, so
 * per-line tax (which depends on each line's post-discount amount) comes out correct. Proportional
 * shares are rounded to 2dp per line, which can leave a stray cent from rounding — that remainder is
 * assigned to the last line rather than dropped, so the sum of per-line discounts always equals the
 * total discount exactly.
 */
export function apportionDiscount(
  lines: DiscountableLine[],
  discount: DiscountInput,
): Record<string, number> {
  const subtotalSum = round2(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));
  const result: Record<string, number> = Object.fromEntries(lines.map((l) => [l.id, 0]));

  if (subtotalSum <= 0 || lines.length === 0) return result;

  const totalDiscount = calculateDiscountAmount(subtotalSum, discount);
  let allocated = 0;

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    if (isLast) {
      result[line.id] = round2(totalDiscount - allocated);
      return;
    }
    const share = round2(totalDiscount * (line.lineSubtotal / subtotalSum));
    result[line.id] = share;
    allocated += share;
  });

  return result;
}
