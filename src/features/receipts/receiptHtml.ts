import type { ReceiptLineItem, ReceiptTaxComponent } from './receiptEngine';

export interface ReceiptBusinessInfo {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  taxIdLabel: string;
  taxId?: string | null;
  invoiceFooterText?: string | null;
  currencySymbol: string;
}

export interface ReceiptOrderInfo {
  invoiceNumber: string | null;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  tableName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  createdAt: Date;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  roundingAdjustment: number;
  grandTotal: number;
  paymentMode?: string | null;
}

export interface ReceiptInput {
  business: ReceiptBusinessInfo;
  order: ReceiptOrderInfo;
  lineItems: ReceiptLineItem[];
  taxComponents: ReceiptTaxComponent[];
}

const ORDER_TYPE_LABEL: Record<ReceiptOrderInfo['orderType'], string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

function money(symbol: string, amount: number): string {
  return `${symbol}${amount.toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Renders a printable/emailable GST-style invoice. Region-agnostic: the tax-id label and which
 * fields appear are driven entirely by restaurant settings, not hardcoded to any one country. */
export function buildReceiptHtml(input: ReceiptInput): string {
  const { business, order, lineItems, taxComponents } = input;
  const symbol = business.currencySymbol;

  const addressLines = [business.addressLine1, business.addressLine2, [business.city, business.state, business.postalCode].filter(Boolean).join(', ')]
    .filter(Boolean)
    .map((line) => escapeHtml(line as string));

  const itemsRows = lineItems
    .map(
      (item) => `
        <tr>
          <td>
            ${escapeHtml(item.name)}
            ${item.modifierNames.length ? `<div class="modifiers">${item.modifierNames.map(escapeHtml).join(', ')}</div>` : ''}
          </td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(symbol, item.unitPrice)}</td>
          <td class="num">${money(symbol, item.lineTotal)}</td>
        </tr>`,
    )
    .join('');

  const taxRows = taxComponents
    .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${money(symbol, c.amount)}</td></tr>`)
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; padding: 24px; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          .muted { color: #666; font-size: 13px; }
          .header { margin-bottom: 16px; }
          .meta { display: flex; justify-content: space-between; margin: 16px 0; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { text-align: left; border-bottom: 1px solid #ccc; padding: 6px 4px; }
          td { padding: 6px 4px; border-bottom: 1px solid #eee; }
          .num { text-align: right; }
          .modifiers { color: #888; font-size: 11px; }
          .totals { width: 100%; margin-top: 12px; font-size: 13px; }
          .totals td { border: none; padding: 3px 4px; }
          .grand-total td { font-size: 16px; font-weight: 700; border-top: 1px solid #333; }
          .footer { margin-top: 24px; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${escapeHtml(business.name)}</h1>
          ${addressLines.map((l) => `<div class="muted">${l}</div>`).join('')}
          ${business.phone ? `<div class="muted">Ph: ${escapeHtml(business.phone)}</div>` : ''}
          ${business.taxId ? `<div class="muted">${escapeHtml(business.taxIdLabel)}: ${escapeHtml(business.taxId)}</div>` : ''}
        </div>

        <div class="meta">
          <div>
            <div><strong>Invoice:</strong> ${order.invoiceNumber ? escapeHtml(order.invoiceNumber) : '—'}</div>
            <div>${ORDER_TYPE_LABEL[order.orderType]}${order.tableName ? ` · Table ${escapeHtml(order.tableName)}` : ''}</div>
            ${order.customerName ? `<div>${escapeHtml(order.customerName)}${order.customerPhone ? ` · ${escapeHtml(order.customerPhone)}` : ''}</div>` : ''}
          </div>
          <div class="muted">${order.createdAt.toLocaleString()}</div>
        </div>

        <table>
          <thead>
            <tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <table class="totals">
          <tr><td>Subtotal</td><td class="num">${money(symbol, order.subtotal)}</td></tr>
          ${order.discountTotal > 0 ? `<tr><td>Discount</td><td class="num">-${money(symbol, order.discountTotal)}</td></tr>` : ''}
          ${taxRows}
          ${order.serviceChargeTotal > 0 ? `<tr><td>Service charge</td><td class="num">${money(symbol, order.serviceChargeTotal)}</td></tr>` : ''}
          ${order.roundingAdjustment !== 0 ? `<tr><td>Rounding</td><td class="num">${order.roundingAdjustment > 0 ? '+' : ''}${money(symbol, order.roundingAdjustment)}</td></tr>` : ''}
          <tr class="grand-total"><td>Total</td><td class="num">${money(symbol, order.grandTotal)}</td></tr>
          ${order.paymentMode ? `<tr><td>Paid via</td><td class="num">${escapeHtml(order.paymentMode)}</td></tr>` : ''}
        </table>

        ${business.invoiceFooterText ? `<div class="footer">${escapeHtml(business.invoiceFooterText)}</div>` : ''}
      </body>
    </html>
  `;
}

/** Plain-text rendering for SMS/thermal-width contexts where HTML isn't usable. */
export function buildReceiptText(input: ReceiptInput): string {
  const { business, order, lineItems, taxComponents } = input;
  const symbol = business.currencySymbol;
  const lines: string[] = [];

  lines.push(business.name);
  if (order.invoiceNumber) lines.push(`Invoice: ${order.invoiceNumber}`);
  lines.push(`${ORDER_TYPE_LABEL[order.orderType]}${order.tableName ? ` - Table ${order.tableName}` : ''}`);
  lines.push(order.createdAt.toLocaleString());
  lines.push('-'.repeat(32));

  for (const item of lineItems) {
    lines.push(`${item.quantity}x ${item.name}  ${money(symbol, item.lineTotal)}`);
    if (item.modifierNames.length) lines.push(`   ${item.modifierNames.join(', ')}`);
  }

  lines.push('-'.repeat(32));
  lines.push(`Subtotal: ${money(symbol, order.subtotal)}`);
  if (order.discountTotal > 0) lines.push(`Discount: -${money(symbol, order.discountTotal)}`);
  for (const c of taxComponents) lines.push(`${c.label}: ${money(symbol, c.amount)}`);
  if (order.serviceChargeTotal > 0) lines.push(`Service charge: ${money(symbol, order.serviceChargeTotal)}`);
  if (order.roundingAdjustment !== 0) {
    lines.push(`Rounding: ${order.roundingAdjustment > 0 ? '+' : ''}${money(symbol, order.roundingAdjustment)}`);
  }
  lines.push(`TOTAL: ${money(symbol, order.grandTotal)}`);
  if (order.paymentMode) lines.push(`Paid via: ${order.paymentMode}`);
  if (business.invoiceFooterText) {
    lines.push('-'.repeat(32));
    lines.push(business.invoiceFooterText);
  }

  return lines.join('\n');
}
