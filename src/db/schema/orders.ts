import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { restaurants, users } from './restaurant';
import { menuItems, comboDeals, modifiers } from './menu';

/** Physical table for dine-in. Named diningTables to avoid confusion with the SQL keyword. */
export const diningTables = sqliteTable('dining_tables', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  capacity: integer('capacity'),
  status: text('status').$type<'free' | 'occupied' | 'billed'>().notNull().default('free'),
  currentOrderId: text('current_order_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  invoiceNumber: text('invoice_number'),
  tableId: text('table_id').references(() => diningTables.id),
  orderType: text('order_type').$type<'dine_in' | 'takeaway' | 'delivery'>().notNull(),
  status: text('status')
    .$type<'draft' | 'parked' | 'active' | 'billed' | 'paid' | 'void'>()
    .notNull()
    .default('active'),
  openedByStaffId: text('opened_by_staff_id')
    .notNull()
    .references(() => users.id),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  subtotal: real('subtotal').notNull().default(0),
  discountTotal: real('discount_total').notNull().default(0),
  taxTotal: real('tax_total').notNull().default(0),
  serviceChargeTotal: real('service_charge_total').notNull().default(0),
  roundingAdjustment: real('rounding_adjustment').notNull().default(0),
  grandTotal: real('grand_total').notNull().default(0),
  amountPaid: real('amount_paid').notNull().default(0),
  notes: text('notes'),
  parkedAt: integer('parked_at', { mode: 'timestamp_ms' }),
  billedAt: integer('billed_at', { mode: 'timestamp_ms' }),
  paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
  voidedAt: integer('voided_at', { mode: 'timestamp_ms' }),
  voidReason: text('void_reason'),
  voidedByStaffId: text('voided_by_staff_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * name/price are snapshotted at add-time so historical bills stay correct even if the
 * menu item is later renamed, repriced, or deleted.
 */
export const orderItems = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  menuItemId: text('menu_item_id').references(() => menuItems.id),
  comboDealId: text('combo_deal_id').references(() => comboDeals.id),
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceSnapshot: real('unit_price_snapshot').notNull(),
  /** Tax rate and service-charge-exemption at add-time, so a later menu edit can't rewrite past bills. */
  taxRatePercentSnapshot: real('tax_rate_percent_snapshot').notNull().default(0),
  /** JSON array of { label, ratePercent }, e.g. CGST/SGST — lets receipts print a compliant per-slab breakdown. */
  taxComponentsSnapshot: text('tax_components_snapshot'),
  isServiceChargeExemptSnapshot: integer('is_service_charge_exempt_snapshot', { mode: 'boolean' })
    .notNull()
    .default(false),
  quantity: integer('quantity').notNull().default(1),
  lineSubtotal: real('line_subtotal').notNull(),
  lineDiscountTotal: real('line_discount_total').notNull().default(0),
  lineTaxTotal: real('line_tax_total').notNull().default(0),
  notes: text('notes'),
  isVoided: integer('is_voided', { mode: 'boolean' }).notNull().default(false),
  voidReason: text('void_reason'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const orderItemModifiers = sqliteTable('order_item_modifiers', {
  id: text('id').primaryKey(),
  orderItemId: text('order_item_id')
    .notNull()
    .references(() => orderItems.id),
  modifierId: text('modifier_id').references(() => modifiers.id),
  nameSnapshot: text('name_snapshot').notNull(),
  priceDeltaSnapshot: real('price_delta_snapshot').notNull().default(0),
});

/** orderItemId is null for a bill-level discount, set for an item-level discount. */
export const discounts = sqliteTable('discounts', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  orderItemId: text('order_item_id').references(() => orderItems.id),
  type: text('type').$type<'flat' | 'percentage'>().notNull(),
  value: real('value').notNull(),
  amountApplied: real('amount_applied').notNull(),
  reason: text('reason'),
  couponCode: text('coupon_code'),
  appliedByStaffId: text('applied_by_staff_id')
    .notNull()
    .references(() => users.id),
  approvedByStaffId: text('approved_by_staff_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  orderId: text('order_id')
    .notNull()
    .references(() => orders.id),
  mode: text('mode').$type<'cash' | 'card' | 'upi' | 'other'>().notNull(),
  amount: real('amount').notNull(),
  reference: text('reference'),
  receivedByStaffId: text('received_by_staff_id')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
