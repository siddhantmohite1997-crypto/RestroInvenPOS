import { round2 } from '@/features/tax/taxEngine';

export type PaymentMode = 'cash' | 'card' | 'upi' | 'other';

export interface SalesOrderInput {
  status: 'draft' | 'parked' | 'active' | 'billed' | 'paid' | 'void';
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceChargeTotal: number;
  grandTotal: number;
}

export interface SalesPaymentInput {
  mode: PaymentMode;
  amount: number;
}

export interface SalesSummary {
  orderCount: number;
  voidCount: number;
  grossSales: number;
  discountsGiven: number;
  taxCollected: number;
  serviceChargeCollected: number;
  netSales: number;
  paymentModeBreakdown: Record<PaymentMode, number>;
}

const EMPTY_PAYMENT_BREAKDOWN: Record<PaymentMode, number> = { cash: 0, card: 0, upi: 0, other: 0 };

/**
 * A "Z-report" style summary over any set of orders (typically one day, but the function itself
 * is date-agnostic — the caller decides the range). Only paid orders count toward sales; voided
 * orders are counted separately rather than netted out, so a void is visible, not hidden.
 */
export function summarizeSales(orders: SalesOrderInput[], payments: SalesPaymentInput[]): SalesSummary {
  const paidOrders = orders.filter((o) => o.status === 'paid');
  const voidCount = orders.filter((o) => o.status === 'void').length;

  const grossSales = round2(paidOrders.reduce((sum, o) => sum + o.subtotal, 0));
  const discountsGiven = round2(paidOrders.reduce((sum, o) => sum + o.discountTotal, 0));
  const taxCollected = round2(paidOrders.reduce((sum, o) => sum + o.taxTotal, 0));
  const serviceChargeCollected = round2(paidOrders.reduce((sum, o) => sum + o.serviceChargeTotal, 0));
  const netSales = round2(paidOrders.reduce((sum, o) => sum + o.grandTotal, 0));

  const paymentModeBreakdown = { ...EMPTY_PAYMENT_BREAKDOWN };
  for (const payment of payments) {
    paymentModeBreakdown[payment.mode] = round2(paymentModeBreakdown[payment.mode] + payment.amount);
  }

  return {
    orderCount: paidOrders.length,
    voidCount,
    grossSales,
    discountsGiven,
    taxCollected,
    serviceChargeCollected,
    netSales,
    paymentModeBreakdown,
  };
}

export interface ItemSaleInput {
  nameSnapshot: string;
  quantity: number;
  lineSubtotal: number;
}

export interface ItemSaleSummary {
  name: string;
  quantitySold: number;
  revenue: number;
}

/** Groups order lines by item name and sorts by revenue, highest first. */
export function summarizeItemSales(items: ItemSaleInput[]): ItemSaleSummary[] {
  const byName = new Map<string, { quantitySold: number; revenue: number }>();

  for (const item of items) {
    const existing = byName.get(item.nameSnapshot) ?? { quantitySold: 0, revenue: 0 };
    existing.quantitySold += item.quantity;
    existing.revenue = round2(existing.revenue + item.lineSubtotal);
    byName.set(item.nameSnapshot, existing);
  }

  return Array.from(byName.entries())
    .map(([name, totals]) => ({ name, ...totals }))
    .sort((a, b) => b.revenue - a.revenue);
}
