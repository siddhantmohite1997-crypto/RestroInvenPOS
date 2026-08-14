import { apportionDiscount, calculateDiscountAmount } from '@/features/discounts/discountEngine';

describe('calculateDiscountAmount', () => {
  it('computes a flat discount', () => {
    expect(calculateDiscountAmount(200, { type: 'flat', value: 50 })).toBe(50);
  });

  it('computes a percentage discount', () => {
    expect(calculateDiscountAmount(200, { type: 'percentage', value: 10 })).toBe(20);
  });

  it('clamps a flat discount to the base amount rather than going negative', () => {
    expect(calculateDiscountAmount(30, { type: 'flat', value: 999 })).toBe(30);
  });

  it('clamps a percentage discount above 100% to 100%', () => {
    expect(calculateDiscountAmount(100, { type: 'percentage', value: 150 })).toBe(100);
  });

  it('rejects a negative discount value by treating it as zero', () => {
    expect(calculateDiscountAmount(100, { type: 'flat', value: -20 })).toBe(0);
    expect(calculateDiscountAmount(100, { type: 'percentage', value: -20 })).toBe(0);
  });
});

describe('apportionDiscount', () => {
  it('splits a flat discount proportionally to each line subtotal', () => {
    const lines = [
      { id: 'a', lineSubtotal: 100 },
      { id: 'b', lineSubtotal: 300 },
    ];
    const result = apportionDiscount(lines, { type: 'flat', value: 40 });

    // a is 25% of the 400 total, b is 75%
    expect(result.a).toBe(10);
    expect(result.b).toBe(30);
  });

  it('splits a percentage discount so each line loses the same percentage', () => {
    const lines = [
      { id: 'a', lineSubtotal: 50 },
      { id: 'b', lineSubtotal: 150 },
    ];
    const result = apportionDiscount(lines, { type: 'percentage', value: 10 });

    expect(result.a).toBe(5);
    expect(result.b).toBe(15);
  });

  it('assigns the rounding remainder to the last line so shares always sum exactly to the total', () => {
    // 10 split three ways by equal-ish subtotals produces repeating decimals per share
    const lines = [
      { id: 'a', lineSubtotal: 33.33 },
      { id: 'b', lineSubtotal: 33.33 },
      { id: 'c', lineSubtotal: 33.34 },
    ];
    const result = apportionDiscount(lines, { type: 'flat', value: 10 });

    const sum = round(result.a + result.b + result.c);
    expect(sum).toBe(10);
  });

  it('returns all zeros for an empty line list instead of dividing by zero', () => {
    expect(apportionDiscount([], { type: 'flat', value: 50 })).toEqual({});
  });

  it('returns all zeros when every line subtotal is zero', () => {
    const lines = [
      { id: 'a', lineSubtotal: 0 },
      { id: 'b', lineSubtotal: 0 },
    ];
    expect(apportionDiscount(lines, { type: 'percentage', value: 10 })).toEqual({ a: 0, b: 0 });
  });

  it('never apportions more than the line itself has (a single-line flat discount larger than the bill)', () => {
    const lines = [{ id: 'a', lineSubtotal: 20 }];
    const result = apportionDiscount(lines, { type: 'flat', value: 999 });
    expect(result.a).toBe(20);
  });
});

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
