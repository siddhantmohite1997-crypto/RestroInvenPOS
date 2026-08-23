import {
  estimateReceiptPdfHeightPx,
  RECEIPT_PDF_WIDTH_PX,
  type ReceiptInput,
} from '@/features/receipts/receiptHtml';

function baseInput(overrides: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    business: {
      name: 'Test Restaurant',
      taxIdLabel: 'GSTIN',
      currencySymbol: '₹',
    },
    order: {
      invoiceNumber: 'INV-1',
      orderType: 'dine_in',
      createdAt: new Date(),
      subtotal: 100,
      discountTotal: 0,
      taxTotal: 0,
      serviceChargeTotal: 0,
      roundingAdjustment: 0,
      grandTotal: 100,
    },
    lineItems: [],
    taxComponents: [],
    ...overrides,
  };
}

describe('receipt PDF sizing', () => {
  it('uses an 80mm-equivalent pixel width regardless of content', () => {
    // 80mm at 72 PPI (points) is ~226.77px.
    expect(RECEIPT_PDF_WIDTH_PX).toBe(227);
  });

  it('never returns a height below the minimum floor for a near-empty receipt', () => {
    const height = estimateReceiptPdfHeightPx(baseInput());
    expect(height).toBeGreaterThanOrEqual(300);
  });

  it('grows the estimate as more line items are added', () => {
    const empty = estimateReceiptPdfHeightPx(baseInput());
    const withItems = estimateReceiptPdfHeightPx(
      baseInput({
        lineItems: [
          { name: 'Paneer crispy', quantity: 1, unitPrice: 100, lineTotal: 100, modifierNames: [] },
          { name: 'Chicken crispy', quantity: 1, unitPrice: 150, lineTotal: 150, modifierNames: [] },
        ],
      }),
    );
    expect(withItems).toBeGreaterThan(empty);
  });

  it('accounts for modifier lines, tax components, and a footer note', () => {
    const withItems = estimateReceiptPdfHeightPx(
      baseInput({
        lineItems: [{ name: 'Paneer crispy', quantity: 1, unitPrice: 100, lineTotal: 100, modifierNames: [] }],
      }),
    );
    const withEverything = estimateReceiptPdfHeightPx(
      baseInput({
        lineItems: [
          { name: 'Paneer crispy', quantity: 1, unitPrice: 100, lineTotal: 100, modifierNames: ['Extra spicy'] },
        ],
        taxComponents: [{ label: 'CGST', amount: 2.5 }, { label: 'SGST', amount: 2.5 }],
        business: { name: 'Test Restaurant', taxIdLabel: 'GSTIN', currencySymbol: '₹', invoiceFooterText: 'Thank you!' },
      }),
    );
    expect(withEverything).toBeGreaterThan(withItems);
  });

  it('produces a large but finite height for a long order rather than truncating', () => {
    const manyItems = Array.from({ length: 40 }, (_, i) => ({
      name: `Item ${i}`,
      quantity: 1,
      unitPrice: 10,
      lineTotal: 10,
      modifierNames: [],
    }));
    const height = estimateReceiptPdfHeightPx(baseInput({ lineItems: manyItems }));
    expect(height).toBeGreaterThan(1000);
    expect(Number.isFinite(height)).toBe(true);
  });
});
