import { summarizeItemSales, summarizeSales } from '@/features/reports/reportEngine';

describe('summarizeSales', () => {
  it('sums gross/net sales, discounts, and tax across paid orders only', () => {
    const summary = summarizeSales(
      [
        { status: 'paid', subtotal: 100, discountTotal: 10, taxTotal: 5, serviceChargeTotal: 0, grandTotal: 95 },
        { status: 'paid', subtotal: 200, discountTotal: 0, taxTotal: 10, serviceChargeTotal: 0, grandTotal: 210 },
        { status: 'active', subtotal: 999, discountTotal: 0, taxTotal: 0, serviceChargeTotal: 0, grandTotal: 999 },
      ],
      [],
    );

    expect(summary.orderCount).toBe(2);
    expect(summary.grossSales).toBe(300);
    expect(summary.discountsGiven).toBe(10);
    expect(summary.taxCollected).toBe(15);
    expect(summary.netSales).toBe(305);
  });

  it('counts void orders separately without folding them into sales totals', () => {
    const summary = summarizeSales(
      [
        { status: 'paid', subtotal: 100, discountTotal: 0, taxTotal: 0, serviceChargeTotal: 0, grandTotal: 100 },
        { status: 'void', subtotal: 500, discountTotal: 0, taxTotal: 0, serviceChargeTotal: 0, grandTotal: 500 },
      ],
      [],
    );

    expect(summary.voidCount).toBe(1);
    expect(summary.grossSales).toBe(100);
  });

  it('breaks payments down by mode, defaulting modes with no activity to zero', () => {
    const summary = summarizeSales(
      [],
      [
        { mode: 'cash', amount: 300 },
        { mode: 'upi', amount: 150 },
        { mode: 'cash', amount: 50 },
      ],
    );

    expect(summary.paymentModeBreakdown).toEqual({ cash: 350, card: 0, upi: 150, other: 0 });
  });

  it('returns all-zero totals for an empty range instead of crashing', () => {
    const summary = summarizeSales([], []);
    expect(summary.orderCount).toBe(0);
    expect(summary.grossSales).toBe(0);
    expect(summary.paymentModeBreakdown).toEqual({ cash: 0, card: 0, upi: 0, other: 0 });
  });
});

describe('summarizeItemSales', () => {
  it('aggregates quantity and revenue for the same item name across multiple lines', () => {
    const result = summarizeItemSales([
      { nameSnapshot: 'Masala Dosa', quantity: 2, lineSubtotal: 240 },
      { nameSnapshot: 'Masala Dosa', quantity: 1, lineSubtotal: 120 },
      { nameSnapshot: 'Tea', quantity: 3, lineSubtotal: 60 },
    ]);

    expect(result).toEqual([
      { name: 'Masala Dosa', quantitySold: 3, revenue: 360 },
      { name: 'Tea', quantitySold: 3, revenue: 60 },
    ]);
  });

  it('sorts items by revenue, highest first', () => {
    const result = summarizeItemSales([
      { nameSnapshot: 'Cheap Item', quantity: 10, lineSubtotal: 50 },
      { nameSnapshot: 'Expensive Item', quantity: 1, lineSubtotal: 500 },
    ]);

    expect(result.map((r) => r.name)).toEqual(['Expensive Item', 'Cheap Item']);
  });

  it('returns an empty list for no items', () => {
    expect(summarizeItemSales([])).toEqual([]);
  });
});
