import { computeTaxComponentBreakdown } from '@/features/receipts/receiptEngine';

describe('computeTaxComponentBreakdown', () => {
  it('sums a single component across lines sharing the same tax rule', () => {
    const result = computeTaxComponentBreakdown([
      {
        nameSnapshot: 'Tea',
        quantity: 1,
        unitPriceSnapshot: 100,
        lineSubtotal: 100,
        lineDiscountTotal: 0,
        taxComponentsSnapshot: JSON.stringify([{ label: 'VAT', ratePercent: 20 }]),
      },
      {
        nameSnapshot: 'Coffee',
        quantity: 1,
        unitPriceSnapshot: 50,
        lineSubtotal: 50,
        lineDiscountTotal: 0,
        taxComponentsSnapshot: JSON.stringify([{ label: 'VAT', ratePercent: 20 }]),
      },
    ]);

    expect(result).toEqual([{ label: 'VAT', amount: 30 }]);
  });

  it('splits a multi-component tax rule (CGST + SGST) into separate lines', () => {
    const result = computeTaxComponentBreakdown([
      {
        nameSnapshot: 'Paneer Tikka',
        quantity: 1,
        unitPriceSnapshot: 200,
        lineSubtotal: 200,
        lineDiscountTotal: 0,
        taxComponentsSnapshot: JSON.stringify([
          { label: 'CGST', ratePercent: 2.5 },
          { label: 'SGST', ratePercent: 2.5 },
        ]),
      },
    ]);

    expect(result).toEqual([
      { label: 'CGST', amount: 5 },
      { label: 'SGST', amount: 5 },
    ]);
  });

  it('computes tax on the post-discount amount, not the raw subtotal', () => {
    const result = computeTaxComponentBreakdown([
      {
        nameSnapshot: 'Burger',
        quantity: 1,
        unitPriceSnapshot: 100,
        lineSubtotal: 100,
        lineDiscountTotal: 50,
        taxComponentsSnapshot: JSON.stringify([{ label: 'GST', ratePercent: 10 }]),
      },
    ]);

    // taxable = 100 - 50 = 50; tax = 50 * 0.10 = 5
    expect(result).toEqual([{ label: 'GST', amount: 5 }]);
  });

  it('ignores lines with no tax rule instead of crediting them to a component', () => {
    const result = computeTaxComponentBreakdown([
      {
        nameSnapshot: 'Bottled Water',
        quantity: 1,
        unitPriceSnapshot: 20,
        lineSubtotal: 20,
        lineDiscountTotal: 0,
        taxComponentsSnapshot: null,
      },
    ]);

    expect(result).toEqual([]);
  });

  it('returns an empty breakdown for an order with no lines', () => {
    expect(computeTaxComponentBreakdown([])).toEqual([]);
  });
});
