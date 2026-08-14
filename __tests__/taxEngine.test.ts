import { applyRounding, calculateOrderTotals, round2 } from '@/features/tax/taxEngine';

describe('round2', () => {
  it('avoids binary float drift on values like 1.005', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(10.005)).toBe(10.01);
  });
});

describe('applyRounding', () => {
  it('nearest_1 rounds to the nearest whole unit', () => {
    expect(applyRounding(100.4, 'nearest_1')).toBe(100);
    expect(applyRounding(100.5, 'nearest_1')).toBe(101);
  });

  it('nearest_0_5 rounds to the nearest half unit', () => {
    expect(applyRounding(100.2, 'nearest_0_5')).toBe(100);
    expect(applyRounding(100.3, 'nearest_0_5')).toBe(100.5);
    expect(applyRounding(100.6, 'nearest_0_5')).toBe(100.5);
    expect(applyRounding(100.8, 'nearest_0_5')).toBe(101);
  });

  it('nearest_5 rounds to the nearest multiple of five', () => {
    expect(applyRounding(101, 'nearest_5')).toBe(100);
    expect(applyRounding(103, 'nearest_5')).toBe(105);
  });

  it('none leaves the amount at 2dp precision', () => {
    expect(applyRounding(100.456, 'none')).toBe(100.46);
  });
});

describe('calculateOrderTotals', () => {
  it('computes subtotal, tax, and grand total for a single untaxed line with no rounding', () => {
    const result = calculateOrderTotals({
      lines: [{ lineSubtotal: 100, taxRatePercent: 0, isServiceChargeExempt: false }],
      serviceChargeEnabled: false,
      serviceChargePercent: 0,
      roundingRule: 'none',
    });

    expect(result).toEqual({
      subtotal: 100,
      discountTotal: 0,
      taxableBase: 100,
      taxTotal: 0,
      serviceChargeTotal: 0,
      roundingAdjustment: 0,
      grandTotal: 100,
    });
  });

  it('applies per-line tax rates independently (mixed GST slabs on one bill)', () => {
    const result = calculateOrderTotals({
      lines: [
        { lineSubtotal: 100, taxRatePercent: 5, isServiceChargeExempt: false },
        { lineSubtotal: 200, taxRatePercent: 12, isServiceChargeExempt: false },
      ],
      serviceChargeEnabled: false,
      serviceChargePercent: 0,
      roundingRule: 'none',
    });

    // 100*0.05 + 200*0.12 = 5 + 24 = 29
    expect(result.taxTotal).toBe(29);
    expect(result.subtotal).toBe(300);
    expect(result.grandTotal).toBe(329);
  });

  it('computes tax on the post-discount amount, not the pre-discount subtotal', () => {
    const result = calculateOrderTotals({
      lines: [{ lineSubtotal: 100, taxRatePercent: 10, isServiceChargeExempt: false, discountAmount: 20 }],
      serviceChargeEnabled: false,
      serviceChargePercent: 0,
      roundingRule: 'none',
    });

    // taxable = 100 - 20 = 80; tax = 80 * 0.10 = 8
    expect(result.discountTotal).toBe(20);
    expect(result.taxableBase).toBe(80);
    expect(result.taxTotal).toBe(8);
    expect(result.grandTotal).toBe(88);
  });

  it('clamps a discount that exceeds the line subtotal instead of going negative', () => {
    const result = calculateOrderTotals({
      lines: [{ lineSubtotal: 50, taxRatePercent: 10, isServiceChargeExempt: false, discountAmount: 999 }],
      serviceChargeEnabled: false,
      serviceChargePercent: 0,
      roundingRule: 'none',
    });

    expect(result.discountTotal).toBe(50);
    expect(result.taxableBase).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it('excludes service-charge-exempt lines from the service charge base', () => {
    const result = calculateOrderTotals({
      lines: [
        { lineSubtotal: 100, taxRatePercent: 0, isServiceChargeExempt: false },
        { lineSubtotal: 100, taxRatePercent: 0, isServiceChargeExempt: true },
      ],
      serviceChargeEnabled: true,
      serviceChargePercent: 10,
      roundingRule: 'none',
    });

    // service charge base is only the non-exempt 100, not the full 200
    expect(result.serviceChargeTotal).toBe(10);
    expect(result.grandTotal).toBe(210);
  });

  it('reports the rounding adjustment as the delta applied to reach the rounded grand total', () => {
    const result = calculateOrderTotals({
      lines: [{ lineSubtotal: 101, taxRatePercent: 0, isServiceChargeExempt: false }],
      serviceChargeEnabled: false,
      serviceChargePercent: 0,
      roundingRule: 'nearest_5',
    });

    // pre-rounding total 101 -> nearest 5 -> 100, adjustment = -1
    expect(result.grandTotal).toBe(100);
    expect(result.roundingAdjustment).toBe(-1);
  });

  it('handles an empty order (no lines) without dividing by zero or crashing', () => {
    const result = calculateOrderTotals({
      lines: [],
      serviceChargeEnabled: true,
      serviceChargePercent: 10,
      roundingRule: 'nearest_1',
    });

    expect(result.grandTotal).toBe(0);
    expect(result.taxTotal).toBe(0);
    expect(result.serviceChargeTotal).toBe(0);
  });
});
