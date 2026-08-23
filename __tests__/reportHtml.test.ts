import { buildReportHtml } from '@/features/reports/reportHtml';
import type { SalesSummary } from '@/features/reports/reportEngine';

function baseSummary(overrides: Partial<SalesSummary> = {}): SalesSummary {
  return {
    grossSales: 500,
    netSales: 450,
    discountsGiven: 50,
    taxCollected: 25,
    serviceChargeCollected: 0,
    orderCount: 5,
    voidCount: 1,
    paymentModeBreakdown: { cash: 100, card: 0, upi: 350, other: 0 },
    ...overrides,
  };
}

describe('buildReportHtml', () => {
  it('embeds the business name, range label, and totals in the document', () => {
    const html = buildReportHtml({
      businessName: 'Test Restaurant',
      rangeLabel: 'Yesterday',
      currencySymbol: '₹',
      summary: baseSummary(),
      generatedAt: new Date('2026-08-23T20:49:35'),
    });

    expect(html).toContain('Test Restaurant');
    expect(html).toContain('Yesterday');
    expect(html).toContain('₹500.00');
    expect(html).toContain('₹450.00');
  });

  it('renders every payment mode with a formatted amount', () => {
    const html = buildReportHtml({
      businessName: 'Test Restaurant',
      rangeLabel: 'Today',
      currencySymbol: '₹',
      summary: baseSummary(),
      generatedAt: new Date(),
    });

    expect(html).toContain('Cash');
    expect(html).toContain('₹100.00');
    expect(html).toContain('UPI');
    expect(html).toContain('₹350.00');
  });

  it('escapes HTML-significant characters in the business name', () => {
    const html = buildReportHtml({
      businessName: 'Tom & Jerry\'s <Diner>',
      rangeLabel: 'Today',
      currencySymbol: '₹',
      summary: baseSummary(),
      generatedAt: new Date(),
    });

    expect(html).toContain('Tom &amp; Jerry');
    expect(html).not.toContain('<Diner>');
  });

  it('is a complete, well-formed HTML document', () => {
    const html = buildReportHtml({
      businessName: 'Test Restaurant',
      rangeLabel: 'Today',
      currencySymbol: '₹',
      summary: baseSummary(),
      generatedAt: new Date(),
    });

    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });
});
