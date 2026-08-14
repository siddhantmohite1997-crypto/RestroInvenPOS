import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { orders, orderItems, payments } from '@/db/schema';
import { summarizeItemSales, summarizeSales, type ItemSaleSummary, type SalesSummary } from './reportEngine';

export interface DateRange {
  /** Inclusive start of the range. */
  start: Date;
  /** Exclusive end of the range. */
  end: Date;
}

async function ordersInRange(restaurantId: string, range: DateRange) {
  return db.query.orders.findMany({
    where: and(
      eq(orders.restaurantId, restaurantId),
      inArray(orders.status, ['paid', 'void']),
      gte(orders.createdAt, range.start),
      lt(orders.createdAt, range.end),
    ),
  });
}

export async function getSalesSummary(restaurantId: string, range: DateRange): Promise<SalesSummary> {
  const rangeOrders = await ordersInRange(restaurantId, range);
  const orderIds = rangeOrders.filter((o) => o.status === 'paid').map((o) => o.id);

  const rangePayments =
    orderIds.length === 0
      ? []
      : await db.query.payments.findMany({ where: inArray(payments.orderId, orderIds) });

  return summarizeSales(rangeOrders, rangePayments);
}

export async function getItemWiseSales(restaurantId: string, range: DateRange): Promise<ItemSaleSummary[]> {
  const rangeOrders = await ordersInRange(restaurantId, range);
  const paidOrderIds = rangeOrders.filter((o) => o.status === 'paid').map((o) => o.id);
  if (paidOrderIds.length === 0) return [];

  const items = await db.query.orderItems.findMany({
    where: and(inArray(orderItems.orderId, paidOrderIds), eq(orderItems.isVoided, false)),
  });

  return summarizeItemSales(items);
}
