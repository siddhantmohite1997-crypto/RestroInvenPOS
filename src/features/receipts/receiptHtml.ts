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

/** expo-print's printToFileAsync ignores the @page CSS above and always renders at a fixed
 * pixel width/height (defaulting to US Letter) unless given explicit dimensions — so we compute
 * an 80mm-wide, content-estimated-height size here for callers to pass in. */
const PX_PER_MM = 72 / 25.4;
export const RECEIPT_PDF_WIDTH_PX = Math.round(80 * PX_PER_MM);

export function estimateReceiptPdfHeightPx(input: ReceiptInput): number {
  const { business, order, lineItems, taxComponents } = input;

  const addressLineCount = [
    business.addressLine1,
    business.addressLine2,
    business.city || business.state || business.postalCode,
  ].filter(Boolean).length;

  const headerLineCount = addressLineCount + (business.phone ? 1 : 0) + (business.taxId ? 1 : 0);
  const itemsHeight = lineItems.reduce((sum, item) => sum + 26 + (item.modifierNames.length ? 12 : 0), 0);

  let totalsRows = 1; // subtotal
  if (order.discountTotal > 0) totalsRows += 1;
  totalsRows += taxComponents.length;
  if (order.serviceChargeTotal > 0) totalsRows += 1;
  if (order.roundingAdjustment !== 0) totalsRows += 1;
  if (order.paymentMode) totalsRows += 1;

  const height =
    90 + // header (business name + border)
    headerLineCount * 12 +
    70 + // meta block (invoice/date/type + borders)
    (order.customerName ? 14 : 0) +
    22 + // items table header
    itemsHeight +
    totalsRows * 16 +
    24 + // grand total row
    (business.invoiceFooterText ? 40 : 0) +
    60; // padding buffer

  return Math.max(300, Math.round(height));
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

/** Thermal-receipt optimized HTML (70–80mm width, ESC/POS compatible).
 * Region-agnostic: tax-id label and visible fields driven by restaurant settings. */
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
          <td class="item-name">
            ${escapeHtml(item.name)}
            ${item.modifierNames.length ? `<div class="modifiers">${item.modifierNames.map(escapeHtml).join(', ')}</div>` : ''}
          </td>
          <td class="item-qty">${item.quantity}</td>
          <td class="item-price">${money(symbol, item.unitPrice)}</td>
          <td class="item-total">${money(symbol, item.lineTotal)}</td>
        </tr>`,
    )
    .join('');

  const taxRows = taxComponents
    .map((c) => `<tr><td>${escapeHtml(c.label)}</td><td class="num">${money(symbol, c.amount)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Receipt</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
            padding: 0;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Courier New', Courier, monospace;
            color: #000;
            background: #fff;
            width: 80mm;
            font-size: 11px;
            line-height: 1.3;
            padding: 4mm 2mm;
          }

          h1 {
            font-size: 13px;
            font-weight: 700;
            margin: 0 0 2mm;
            text-align: center;
            word-wrap: break-word;
            max-width: 76mm;
          }

          .header {
            text-align: center;
            margin-bottom: 3mm;
            border-bottom: 1px dashed #000;
            padding-bottom: 2mm;
          }

          .muted {
            color: #333;
            font-size: 10px;
            margin: 0.5mm 0;
            word-wrap: break-word;
          }

          .meta {
            font-size: 10px;
            margin: 2mm 0;
            padding-bottom: 2mm;
            border-bottom: 1px dashed #000;
          }

          .meta-row {
            display: flex;
            justify-content: space-between;
            margin: 1mm 0;
            font-size: 10px;
          }

          .meta-left {
            flex: 1;
            word-wrap: break-word;
          }

          .meta-right {
            text-align: right;
            white-space: nowrap;
            margin-left: 2mm;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin: 2mm 0;
          }

          thead tr {
            border-bottom: 1px solid #000;
            font-weight: 700;
          }

          th {
            text-align: left;
            padding: 1mm 0;
            font-weight: 700;
            font-size: 10px;
          }

          td {
            padding: 0.5mm 1mm;
            word-wrap: break-word;
          }

          .item-name {
            flex: 1;
            word-wrap: break-word;
          }

          .item-qty,
          .item-price,
          .item-total,
          .num {
            text-align: right;
            white-space: nowrap;
            padding-right: 1mm;
          }

          .modifiers {
            color: #666;
            font-size: 9px;
            margin-top: 0.5mm;
            font-style: italic;
          }

          .totals {
            width: 100%;
            margin: 2mm 0;
            font-size: 10px;
            border-top: 1px dashed #000;
            padding-top: 1mm;
            border-collapse: collapse;
          }

          .totals tr {
            border: none;
          }

          .totals td {
            border: none;
            padding: 0.5mm 0;
          }

          .totals .label {
            text-align: left;
          }

          .totals .amount {
            text-align: right;
            white-space: nowrap;
          }

          .grand-total {
            font-size: 12px;
            font-weight: 700;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
          }

          .grand-total td {
            padding: 1mm 0;
          }

          .footer {
            margin-top: 2mm;
            padding-top: 2mm;
            font-size: 9px;
            color: #333;
            text-align: center;
            border-top: 1px dashed #000;
            word-wrap: break-word;
          }

          @media print {
            body {
              padding: 0;
              margin: 0;
            }
            @page {
              margin: 0;
            }
          }
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
          <div class="meta-row">
            <span class="meta-left"><strong>Inv:</strong> ${order.invoiceNumber ? escapeHtml(order.invoiceNumber) : 'DRAFT'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-left">${ORDER_TYPE_LABEL[order.orderType]}</span>
            ${order.tableName ? `<span class="meta-right">Table ${escapeHtml(order.tableName)}</span>` : ''}
          </div>
          ${order.customerName ? `<div class="meta-row"><span class="meta-left">${escapeHtml(order.customerName)}${order.customerPhone ? ` (${escapeHtml(order.customerPhone)})` : ''}</span></div>` : ''}
          <div class="meta-row">
            <span class="meta-left">${order.createdAt.toLocaleString()}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="item-name">Item</th>
              <th class="item-qty">Qty</th>
              <th class="item-price">Price</th>
              <th class="item-total">Amt</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <table class="totals">
          <tr>
            <td class="label">Subtotal</td>
            <td class="amount">${money(symbol, order.subtotal)}</td>
          </tr>
          ${order.discountTotal > 0 ? `<tr><td class="label">Discount</td><td class="amount">-${money(symbol, order.discountTotal)}</td></tr>` : ''}
          ${taxRows}
          ${order.serviceChargeTotal > 0 ? `<tr><td class="label">Service Charge</td><td class="amount">${money(symbol, order.serviceChargeTotal)}</td></tr>` : ''}
          ${order.roundingAdjustment !== 0 ? `<tr><td class="label">Rounding</td><td class="amount">${order.roundingAdjustment > 0 ? '+' : ''}${money(symbol, order.roundingAdjustment)}</td></tr>` : ''}
          <tr class="grand-total">
            <td class="label">TOTAL</td>
            <td class="amount">${money(symbol, order.grandTotal)}</td>
          </tr>
          ${order.paymentMode ? `<tr><td class="label">Paid via</td><td class="amount">${escapeHtml(order.paymentMode)}</td></tr>` : ''}
        </table>

        ${business.invoiceFooterText ? `<div class="footer">${escapeHtml(business.invoiceFooterText)}</div>` : ''}
      </body>
    </html>`;
}

/** Plain-text rendering for SMS/thermal-width contexts where HTML isn't usable. */
export function buildReceiptText(input: ReceiptInput): string {
  const { business, order, lineItems, taxComponents } = input;
  const symbol = business.currencySymbol;
  const lines: string[] = [];

  lines.push(business.name);
  lines.push('');

  const address = [business.addressLine1, business.addressLine2]
    .filter((a) => a)
    .concat(
      [business.city, business.state, business.postalCode]
        .filter((a) => a)
        .join(' '),
    )
    .filter((a) => a);
  address.forEach((line) => lines.push(line as string));
  if (business.phone) lines.push(`Ph: ${business.phone}`);

  lines.push('');
  lines.push(`Invoice: ${order.invoiceNumber ?? 'DRAFT'}`);
  lines.push(`Date: ${order.createdAt.toLocaleString()}`);
  lines.push(`Type: ${ORDER_TYPE_LABEL[order.orderType]}`);
  if (order.tableName) lines.push(`Table: ${order.tableName}`);

  lines.push('');
  lines.push('========================================');
  lineItems.forEach((item) => {
    lines.push(`${item.name.substring(0, 24).padEnd(24)} ${item.quantity.toString().padStart(2)}`);
    if (item.modifierNames.length) lines.push(`  > ${item.modifierNames.join(', ')}`);
    lines.push(`  ${money(symbol, item.lineTotal).padStart(10)}`);
  });

  lines.push('========================================');
  lines.push(`Subtotal                 ${money(symbol, order.subtotal).padStart(10)}`);
  if (order.discountTotal > 0) lines.push(`Discount                 -${money(symbol, order.discountTotal).padStart(9)}`);
  taxComponents.forEach((c) => lines.push(`${c.label.padEnd(24)} ${money(symbol, c.amount).padStart(10)}`));
  if (order.serviceChargeTotal > 0) lines.push(`Service Charge           ${money(symbol, order.serviceChargeTotal).padStart(10)}`);
  lines.push('========================================');
  lines.push(`TOTAL                    ${money(symbol, order.grandTotal).padStart(10)}`);
  if (order.paymentMode) lines.push(`Paid: ${order.paymentMode}`);

  if (business.invoiceFooterText) {
    lines.push('');
    lines.push(business.invoiceFooterText);
  }

  return lines.join('\n');
}
