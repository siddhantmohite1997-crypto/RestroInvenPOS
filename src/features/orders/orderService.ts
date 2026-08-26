import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  orders,
  orderItems,
  orderItemModifiers,
  discounts,
  payments,
  menuItems,
  comboDeals,
  taxRules,
  restaurants,
} from '@/db/schema';
import { generateId } from '@/lib/id';

import { calculateOrderTotals, round2 } from '@/features/tax/taxEngine';
import { apportionDiscount, type DiscountInput } from '@/features/discounts/discountEngine';
import { setTableStatus } from '@/features/tables/tableService';
import { nextInvoiceNumber } from '@/features/restaurant/restaurantService';
import { logAudit } from '@/features/audit/auditService';

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderItemModifier = typeof orderItemModifiers.$inferSelect;
export type Discount = typeof discounts.$inferSelect;

export interface OrderItemWithModifiers extends OrderItem {
  modifiers: OrderItemModifier[];
}

export interface OrderWithItems extends Order {
  items: OrderItemWithModifiers[];
  billDiscount: Discount | null;
}

export interface CreateOrderInput {
  restaurantId: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  staffId: string;
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<string> {
  const id = generateId();
  await db.insert(orders).values({
    id,
    restaurantId: input.restaurantId,
    orderType: input.orderType,
    tableId: input.tableId,
    openedByStaffId: input.staffId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    status: 'active',
  });
  if (input.tableId) {
    await setTableStatus(input.tableId, 'occupied', id);
  }
  return id;
}

/** Persists a customer's phone/email once they give it (e.g. to send a receipt), so it's
 * remembered and synced instead of only living in transient screen state. */
export async function updateOrderContact(
  orderId: string,
  input: { customerPhone?: string; customerEmail?: string },
): Promise<void> {
  await db
    .update(orders)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export async function getOrder(id: string): Promise<OrderWithItems | null> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) return null;

  const items = await db.query.orderItems.findMany({
    where: (oi, { and: andOp, eq: eqOp }) => andOp(eqOp(oi.orderId, id), eqOp(oi.isVoided, false)),
    orderBy: (oi, { asc }) => asc(oi.createdAt),
  });
  const itemsWithModifiers = await Promise.all(
    items.map(async (item) => ({
      ...item,
      modifiers: await db.query.orderItemModifiers.findMany({
        where: (m, { eq: eqOp }) => eqOp(m.orderItemId, item.id),
      }),
    })),
  );

  const billDiscount =
    (await db.query.discounts.findFirst({
      where: (d, { and: andOp, eq: eqOp, isNull: isNullOp }) =>
        andOp(eqOp(d.orderId, id), isNullOp(d.orderItemId)),
    })) ?? null;

  return { ...order, items: itemsWithModifiers, billDiscount };
}

export async function listOpenOrders(restaurantId: string): Promise<Order[]> {
  return db.query.orders.findMany({
    where: (o, { and: andOp, eq: eqOp, inArray }) =>
      andOp(eqOp(o.restaurantId, restaurantId), inArray(o.status, ['active', 'draft'])),
    orderBy: (o, { desc }) => desc(o.createdAt),
  });
}

export async function listParkedOrders(restaurantId: string): Promise<Order[]> {
  return db.query.orders.findMany({
    where: (o, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(o.restaurantId, restaurantId), eqOp(o.status, 'parked')),
    orderBy: (o, { desc }) => desc(o.parkedAt),
  });
}

export interface AddItemInput {
  menuItemId?: string;
  comboDealId?: string;
  quantity: number;
  modifiers?: { modifierId: string; name: string; priceDelta: number }[];
  notes?: string;
}

export async function addItemToOrder(orderId: string, input: AddItemInput): Promise<void> {
  // Plain re-taps of the same item (no modifiers, no notes — e.g. the quick-add menu grid)
  // should bump the quantity on the existing line rather than create a new one; a customized
  // line (modifiers and/or notes) always stays its own row, since merging it with a
  // differently-customized order of the same item would silently drop the customization.
  const isPlainAdd = (input.modifiers?.length ?? 0) === 0 && !input.notes;
  if (isPlainAdd) {
    const existing = await db.query.orderItems.findFirst({
      where: (oi, { and: andOp, eq: eqOp, isNull: isNullOp }) =>
        andOp(
          eqOp(oi.orderId, orderId),
          eqOp(oi.isVoided, false),
          isNullOp(oi.notes),
          input.comboDealId
            ? eqOp(oi.comboDealId, input.comboDealId)
            : eqOp(oi.menuItemId, input.menuItemId!),
        ),
    });
    if (existing) {
      const existingModifiers = await db.query.orderItemModifiers.findMany({
        where: (m, { eq: eqOp }) => eqOp(m.orderItemId, existing.id),
      });
      if (existingModifiers.length === 0) {
        const quantity = existing.quantity + input.quantity;
        await db
          .update(orderItems)
          .set({
            quantity,
            lineSubtotal: round2(existing.unitPriceSnapshot * quantity),
            updatedAt: new Date(),
          })
          .where(eq(orderItems.id, existing.id));
        await recalculateOrderTotals(orderId);
        return;
      }
    }
  }

  let name: string;
  let basePrice: number;
  let taxRuleId: string | null;
  let isServiceChargeExempt = false;
  let menuItemId: string | null = null;
  let comboDealId: string | null = null;

  if (input.comboDealId) {
    const combo = await db.query.comboDeals.findFirst({
      where: eq(comboDeals.id, input.comboDealId),
    });
    if (!combo) throw new Error('Combo not found');
    comboDealId = combo.id;
    name = combo.name;
    basePrice = combo.price;
    taxRuleId = combo.taxRuleId;
  } else {
    const menuItem = await db.query.menuItems.findFirst({
      where: eq(menuItems.id, input.menuItemId!),
    });
    if (!menuItem) throw new Error('Menu item not found');
    menuItemId = menuItem.id;
    name = menuItem.name;
    basePrice = menuItem.price;
    taxRuleId = menuItem.taxRuleId;
    isServiceChargeExempt = menuItem.isServiceChargeExempt;
  }

  let taxRatePercent = 0;
  let taxComponentsSnapshot: string | null = null;
  if (taxRuleId) {
    const rule = await db.query.taxRules.findFirst({ where: eq(taxRules.id, taxRuleId) });
    taxRatePercent = rule?.totalRatePercent ?? 0;
    const components = await db.query.taxComponents.findMany({
      where: (c, { eq: eqOp }) => eqOp(c.taxRuleId, taxRuleId!),
      orderBy: (c, { asc }) => asc(c.sortOrder),
    });
    if (components.length > 0) {
      taxComponentsSnapshot = JSON.stringify(
        components.map((c) => ({ label: c.label, ratePercent: c.ratePercent })),
      );
    }
  }

  const modifiersSum = (input.modifiers ?? []).reduce((sum, m) => sum + m.priceDelta, 0);
  const unitPrice = round2(basePrice + modifiersSum);
  const lineSubtotal = round2(unitPrice * input.quantity);

  const itemId = generateId();
  await db.insert(orderItems).values({
    id: itemId,
    orderId,
    menuItemId,
    comboDealId,
    nameSnapshot: name,
    unitPriceSnapshot: unitPrice,
    taxRatePercentSnapshot: taxRatePercent,
    taxComponentsSnapshot,
    isServiceChargeExemptSnapshot: isServiceChargeExempt,
    quantity: input.quantity,
    lineSubtotal,
    notes: input.notes,
  });

  for (const m of input.modifiers ?? []) {
    await db.insert(orderItemModifiers).values({
      id: generateId(),
      orderItemId: itemId,
      modifierId: m.modifierId,
      nameSnapshot: m.name,
      priceDeltaSnapshot: m.priceDelta,
    });
  }

  await recalculateOrderTotals(orderId);
}

export async function updateItemQuantity(orderItemId: string, quantity: number): Promise<void> {
  const item = await db.query.orderItems.findFirst({ where: eq(orderItems.id, orderItemId) });
  if (!item) return;
  const lineSubtotal = round2(item.unitPriceSnapshot * quantity);
  await db
    .update(orderItems)
    .set({ quantity, lineSubtotal, updatedAt: new Date() })
    .where(eq(orderItems.id, orderItemId));
  await recalculateOrderTotals(item.orderId);
}

/** Pre-payment cart edit — a plain delete, not a formal "void" (that's for edits after a bill is finalized, Phase 6). */
export async function removeItemFromOrder(orderItemId: string): Promise<void> {
  const item = await db.query.orderItems.findFirst({ where: eq(orderItems.id, orderItemId) });
  if (!item) return;
  await db.delete(orderItemModifiers).where(eq(orderItemModifiers.orderItemId, orderItemId));
  await db.delete(orderItems).where(eq(orderItems.id, orderItemId));
  await recalculateOrderTotals(item.orderId);
}

export async function parkOrder(orderId: string): Promise<void> {
  await db
    .update(orders)
    .set({ status: 'parked', parkedAt: new Date() })
    .where(eq(orders.id, orderId));
}

export async function resumeOrder(orderId: string): Promise<void> {
  await db.update(orders).set({ status: 'active', parkedAt: null }).where(eq(orders.id, orderId));
}

export interface ApplyDiscountInput extends DiscountInput {
  reason?: string;
  couponCode?: string;
  staffId: string;
  /** Set when a cashier applied a large discount and an owner/admin approved it via PIN override. */
  approvedByStaffId?: string;
}

/** Bill-level discount. Reapplying replaces the previous one rather than stacking. */
export async function applyBillDiscount(orderId: string, input: ApplyDiscountInput): Promise<void> {
  await clearBillDiscount(orderId);

  const items = await db.query.orderItems.findMany({
    where: (oi, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(oi.orderId, orderId), eqOp(oi.isVoided, false)),
  });
  const shares = apportionDiscount(
    items.map((i) => ({ id: i.id, lineSubtotal: i.lineSubtotal })),
    input,
  );
  const total = round2(Object.values(shares).reduce((sum, v) => sum + v, 0));

  await db.insert(discounts).values({
    id: generateId(),
    orderId,
    orderItemId: null,
    type: input.type,
    value: input.value,
    amountApplied: total,
    reason: input.reason,
    couponCode: input.couponCode,
    appliedByStaffId: input.staffId,
    approvedByStaffId: input.approvedByStaffId,
  });

  for (const item of items) {
    await db
      .update(orderItems)
      .set({ lineDiscountTotal: shares[item.id] ?? 0 })
      .where(eq(orderItems.id, item.id));
  }

  await recalculateOrderTotals(orderId);

  if (input.approvedByStaffId) {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (order) {
      await logAudit({
        restaurantId: order.restaurantId,
        staffId: input.approvedByStaffId,
        action: 'discount_override',
        entityType: 'order',
        entityId: orderId,
        reason: `${input.reason ?? 'Large discount'} (requested by cashier, ${total.toFixed(2)} applied)`,
      });
    }
  }
}

export async function clearBillDiscount(orderId: string): Promise<void> {
  const existing = await db.query.discounts.findMany({
    where: (d, { and: andOp, eq: eqOp, isNull: isNullOp }) =>
      andOp(eqOp(d.orderId, orderId), isNullOp(d.orderItemId)),
  });
  for (const d of existing) {
    await db.delete(discounts).where(eq(discounts.id, d.id));
  }
  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) });
  for (const item of items) {
    await db.update(orderItems).set({ lineDiscountTotal: 0 }).where(eq(orderItems.id, item.id));
  }
  await recalculateOrderTotals(orderId);
}

async function recalculateOrderTotals(orderId: string): Promise<void> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return;
  const restaurant = await db.query.restaurants.findFirst({
    where: eq(restaurants.id, order.restaurantId),
  });
  if (!restaurant) return;

  const items = await db.query.orderItems.findMany({
    where: (oi, { and: andOp, eq: eqOp }) =>
      andOp(eqOp(oi.orderId, orderId), eqOp(oi.isVoided, false)),
  });

  const totals = calculateOrderTotals({
    lines: items.map((i) => ({
      lineSubtotal: i.lineSubtotal,
      taxRatePercent: i.taxRatePercentSnapshot,
      isServiceChargeExempt: i.isServiceChargeExemptSnapshot,
      discountAmount: i.lineDiscountTotal,
    })),
    serviceChargeEnabled: restaurant.serviceChargeEnabled,
    serviceChargePercent: restaurant.serviceChargePercent,
    roundingRule: restaurant.roundingRule,
  });

  for (const item of items) {
    const taxable = Math.max(0, item.lineSubtotal - item.lineDiscountTotal);
    const lineTax = round2(taxable * (item.taxRatePercentSnapshot / 100));
    await db.update(orderItems).set({ lineTaxTotal: lineTax }).where(eq(orderItems.id, item.id));
  }

  await db
    .update(orders)
    .set({
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      serviceChargeTotal: totals.serviceChargeTotal,
      roundingAdjustment: totals.roundingAdjustment,
      grandTotal: totals.grandTotal,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}

export interface RecordPaymentInput {
  mode: 'cash' | 'card' | 'upi' | 'other';
  reference?: string;
  staffId: string;
}

/** Single payment mode only for now — split payments across modes are a later phase. */
export async function recordPayment(orderId: string, input: RecordPaymentInput): Promise<void> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new Error('Order not found');

  await db.insert(payments).values({
    id: generateId(),
    orderId,
    mode: input.mode,
    amount: order.grandTotal,
    reference: input.reference,
    receivedByStaffId: input.staffId,
  });

  const invoiceNumber = order.invoiceNumber ?? (await nextInvoiceNumber(order.restaurantId));

  await db
    .update(orders)
    .set({
      status: 'paid',
      invoiceNumber,
      amountPaid: order.grandTotal,
      billedAt: order.billedAt ?? new Date(),
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  if (order.tableId) {
    await setTableStatus(order.tableId, 'free', null);
  }
}

export interface VoidOrderInput {
  staffId: string;
  reason: string;
  /** Set when a cashier voided this and an owner/admin approved it via PIN override. */
  approvedByStaffId?: string;
}

/** Voids a paid/billed order. Always writes an audit log entry — this is exactly the kind of
 * action Phase 6's audit trail exists for. */
export async function voidOrder(orderId: string, input: VoidOrderInput): Promise<void> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) throw new Error('Order not found');

  await db
    .update(orders)
    .set({
      status: 'void',
      voidedAt: new Date(),
      voidReason: input.reason,
      voidedByStaffId: input.staffId,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  if (order.tableId) {
    await setTableStatus(order.tableId, 'free', null);
  }

  await logAudit({
    restaurantId: order.restaurantId,
    staffId: input.approvedByStaffId ?? input.staffId,
    action: input.approvedByStaffId ? 'void_order_override' : 'void_order',
    entityType: 'order',
    entityId: orderId,
    reason: input.approvedByStaffId ? `${input.reason} (requested by cashier)` : input.reason,
    before: { status: order.status, grandTotal: order.grandTotal },
    after: { status: 'void' },
  });
}
