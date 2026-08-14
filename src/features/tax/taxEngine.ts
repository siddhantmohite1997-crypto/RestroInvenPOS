export type RoundingRule = 'none' | 'nearest_1' | 'nearest_0_5' | 'nearest_5';

export interface TaxableLine {
  /** Line subtotal after quantity and modifiers, before any discount. */
  lineSubtotal: number;
  /** Combined tax rate for this line's tax rule, e.g. 5 for 5%. 0 if untaxed. */
  taxRatePercent: number;
  isServiceChargeExempt: boolean;
  /** Absolute discount amount already allocated to this line (see discountEngine). */
  discountAmount?: number;
}

export interface OrderTotalsInput {
  lines: TaxableLine[];
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
  roundingRule: RoundingRule;
}

export interface OrderTotals {
  subtotal: number;
  discountTotal: number;
  taxableBase: number;
  taxTotal: number;
  serviceChargeTotal: number;
  roundingAdjustment: number;
  grandTotal: number;
}

/** Rounds to 2dp using a small epsilon nudge so 1.005 doesn't fall victim to binary float truncation. */
export function round2(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function applyRounding(amount: number, rule: RoundingRule): number {
  switch (rule) {
    case 'none':
      return round2(amount);
    case 'nearest_1':
      return Math.round(amount);
    case 'nearest_0_5':
      return Math.round(amount * 2) / 2;
    case 'nearest_5':
      return Math.round(amount / 5) * 5;
  }
}

/**
 * Computes subtotal, tax, service charge, rounding, and grand total for an order.
 *
 * Tax is calculated per line (on that line's post-discount amount) rather than on the order
 * total, since different items can carry different tax rules/slabs. Service charge is computed
 * on the sum of non-exempt lines' post-discount amounts. Rounding is applied once, at the end,
 * to the grand total — the difference from the unrounded total is reported as roundingAdjustment
 * so the bill can show it as an explicit line rather than silently absorbing it into tax.
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let serviceChargeBase = 0;

  for (const line of input.lines) {
    const lineDiscount = Math.min(line.discountAmount ?? 0, line.lineSubtotal);
    const taxableAmount = Math.max(0, line.lineSubtotal - lineDiscount);

    subtotal += line.lineSubtotal;
    discountTotal += lineDiscount;
    taxTotal += taxableAmount * (line.taxRatePercent / 100);

    if (input.serviceChargeEnabled && !line.isServiceChargeExempt) {
      serviceChargeBase += taxableAmount;
    }
  }

  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  taxTotal = round2(taxTotal);
  const taxableBase = round2(subtotal - discountTotal);

  const serviceChargeTotal = input.serviceChargeEnabled
    ? round2(serviceChargeBase * (input.serviceChargePercent / 100))
    : 0;

  const preRoundingTotal = taxableBase + taxTotal + serviceChargeTotal;
  const grandTotal = applyRounding(preRoundingTotal, input.roundingRule);
  const roundingAdjustment = round2(grandTotal - preRoundingTotal);

  return {
    subtotal,
    discountTotal,
    taxableBase,
    taxTotal,
    serviceChargeTotal,
    roundingAdjustment,
    grandTotal: round2(grandTotal),
  };
}
