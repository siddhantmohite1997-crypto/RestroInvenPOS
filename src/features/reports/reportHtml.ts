import type { SalesSummary } from './reportEngine';

const PAYMENT_MODE_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other' };

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface ReportHtmlInput {
  businessName: string;
  rangeLabel: string;
  currencySymbol: string;
  summary: SalesSummary;
  generatedAt: Date;
}

/** A4-friendly report document — unlike receipts, this is meant to be read/filed, not printed
 * on a thermal roll, so it uses the printer's default page size rather than an explicit width. */
export function buildReportHtml(input: ReportHtmlInput): string {
  const { businessName, rangeLabel, currencySymbol, summary, generatedAt } = input;
  const money = (n: number) => `${currencySymbol}${n.toFixed(2)}`;

  const paymentRows = Object.entries(summary.paymentModeBreakdown)
    .map(
      ([mode, amount]) =>
        `<tr><td>${escapeHtml(PAYMENT_MODE_LABEL[mode] ?? mode)}</td><td class="num">${money(amount)}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sales Report</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Helvetica, Arial, sans-serif; color: #111; padding: 32px; }
          h1 { font-size: 22px; margin-bottom: 4px; }
          .subtitle { color: #555; font-size: 13px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          td, th { padding: 8px 4px; border-bottom: 1px solid #ddd; font-size: 13px; text-align: left; }
          .num { text-align: right; }
          .summary-grid { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
          .summary-card { flex: 1 1 40%; background: #f5f5f5; border-radius: 8px; padding: 12px 16px; }
          .summary-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
          .section-label { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
          .footer { margin-top: 32px; color: #999; font-size: 11px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(businessName)}</h1>
        <div class="subtitle">Sales report — ${escapeHtml(rangeLabel)}</div>

        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Gross Sales</div>
            <div class="summary-value">${money(summary.grossSales)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Net Sales</div>
            <div class="summary-value">${money(summary.netSales)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Discounts</div>
            <div class="summary-value">${money(summary.discountsGiven)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Tax Collected</div>
            <div class="summary-value">${money(summary.taxCollected)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Orders</div>
            <div class="summary-value">${summary.orderCount}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Voids</div>
            <div class="summary-value">${summary.voidCount}</div>
          </div>
        </div>

        <div class="section-label">Payment mode breakdown</div>
        <table>
          <thead><tr><th>Mode</th><th class="num">Amount</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>

        <div class="footer">Generated ${escapeHtml(generatedAt.toLocaleString())}</div>
      </body>
    </html>`;
}
