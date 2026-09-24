import { eq } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { db as Database } from '@/db/client';
import {
  categories,
  taxRules,
  taxComponents,
  menuItems,
  modifierGroups,
  modifiers,
  menuItemModifierGroups,
  comboDeals,
  comboDealItems,
  suppliers,
  purchases,
  inventoryItems,
  inventoryPurchases,
  recipeIngredients,
  diningTables,
  orders,
  orderItems,
  orderItemModifiers,
  discounts,
  payments,
  auditLogs,
  restaurants,
} from '@/db/schema';
import { snakeRowToDrizzle } from './rowConversion';

/** true if the incoming row should replace what's stored locally: nothing stored yet, or the
 * incoming version is strictly newer. Equal or older means the local device's own unpushed
 * edit (or a genuinely identical snapshot) wins -- pulling an equal-or-older cloud copy must
 * never regress a local change this device hasn't had a chance to push yet. */
export function shouldApplyIncoming(localUpdatedAt: Date | null, incomingUpdatedAt: Date): boolean {
  if (localUpdatedAt === null) return true;
  return incomingUpdatedAt.getTime() > localUpdatedAt.getTime();
}

type Tx = Parameters<Parameters<typeof Database.transaction>[0]>[0];

/** Tables that resolve conflicts by plain last-write-wins on updatedAt, upserting via
 * onConflictDoUpdate — every column except the row's own id. Order matches TABLE_MAP's
 * parent-before-child FK-safe order (restaurants and orders are handled separately below). */
const LAST_WRITE_WINS_TABLES: { key: string; table: SQLiteTable }[] = [
  { key: 'categories', table: categories },
  { key: 'taxRules', table: taxRules },
  { key: 'menuItems', table: menuItems },
  { key: 'modifierGroups', table: modifierGroups },
  { key: 'modifiers', table: modifiers },
  { key: 'comboDeals', table: comboDeals },
  { key: 'suppliers', table: suppliers },
  { key: 'diningTables', table: diningTables },
  // recipeIngredients genuinely gets updated in place (see setRecipeIngredients in
  // inventoryService.ts -- an existing ingredient row keeps its id and gets its
  // quantityRequired/isActive updated, it is never treated as append-only), so it belongs
  // here, not in APPEND_ONLY_TABLES below -- matching the server-side pull query in Task 4,
  // which also filters it on updated_at, not created_at.
  { key: 'recipeIngredients', table: recipeIngredients },
];

/** Append-only: never updated after insert, so there's no conflict to resolve — insert if this
 * device doesn't already have the row, otherwise leave the existing one alone. */
const APPEND_ONLY_TABLES: { key: string; table: SQLiteTable }[] = [
  { key: 'taxComponents', table: taxComponents },
  { key: 'menuItemModifierGroups', table: menuItemModifierGroups },
  { key: 'comboDealItems', table: comboDealItems },
  { key: 'purchases', table: purchases },
  { key: 'inventoryPurchases', table: inventoryPurchases },
  { key: 'auditLogs', table: auditLogs },
];

const ORDER_CHILD_TABLES: { key: string; table: SQLiteTable }[] = [
  { key: 'orderItems', table: orderItems },
  { key: 'orderItemModifiers', table: orderItemModifiers },
  { key: 'discounts', table: discounts },
  { key: 'payments', table: payments },
];

async function applyLastWriteWinsRow(tx: Tx, table: SQLiteTable, row: Record<string, unknown>): Promise<void> {
  const converted = snakeRowToDrizzle(table, row);
  const id = converted.id as string;
  const incomingUpdatedAt = converted.updatedAt as Date;

  const existing = await tx
    .select({ updatedAt: (table as unknown as { updatedAt: AnySQLiteColumn }).updatedAt })
    .from(table)
    .where(eq((table as unknown as { id: AnySQLiteColumn }).id, id))
    .limit(1);

  const localUpdatedAt = existing.length > 0 ? (existing[0].updatedAt as Date) : null;
  if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) return;

  const { id: _id, ...setFields } = converted;
  // The `as any` here (and at every other `.values(...)` call in this file) is deliberate: each
  // Drizzle table has its own generated, strongly-typed insert shape, and this file's whole
  // point is being the one place that walks every table generically from a data-driven list
  // (see the file-level intent in applyPulledData's doc comment) rather than special-casing each
  // one, so it can't satisfy those per-table shapes statically.
  await tx.insert(table).values(converted as any).onConflictDoUpdate({ target: (table as unknown as { id: AnySQLiteColumn }).id, set: setFields });
}

async function applyAppendOnlyRow(tx: Tx, table: SQLiteTable, row: Record<string, unknown>): Promise<void> {
  const converted = snakeRowToDrizzle(table, row);
  await tx.insert(table).values(converted as any).onConflictDoNothing();
}

/** Applies one /sync response's pulledData to local SQLite, table by table, inside the
 * transaction the caller already has open. restaurants (a singleton row) and inventoryItems
 * (quantity is special-cased -- see below) are handled separately from the generic
 * last-write-wins loop; orders and its four child tables are handled together, since a child
 * row is only ever meaningful alongside the order version it belongs to. */
export async function applyPulledData(tx: Tx, pulledData: Record<string, unknown[]>): Promise<void> {
  const restaurantRows = pulledData.restaurants ?? [];
  for (const row of restaurantRows) {
    await applyLastWriteWinsRow(tx, restaurants, row as Record<string, unknown>);
  }

  for (const { key, table } of LAST_WRITE_WINS_TABLES) {
    for (const row of pulledData[key] ?? []) {
      await applyLastWriteWinsRow(tx, table, row as Record<string, unknown>);
    }
  }

  // inventoryItems: every column except quantity follows the normal last-write-wins rule;
  // quantity itself is always adopted from the server, since POST /inventory/adjust-stock has
  // made the server the sole authority for it (see the spec's Part 2).
  for (const row of pulledData.inventoryItems ?? []) {
    const converted = snakeRowToDrizzle(inventoryItems, row as Record<string, unknown>);
    const id = converted.id as string;
    const incomingUpdatedAt = converted.updatedAt as Date;

    const existing = await tx
      .select({ updatedAt: inventoryItems.updatedAt, quantity: inventoryItems.quantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(inventoryItems).values(converted as any).onConflictDoNothing();
      continue;
    }

    const localUpdatedAt = existing[0].updatedAt;
    // quantity always adopts the server's value regardless of the last-write-wins outcome for
    // every other column -- computed once, applied whichever branch below runs.
    const quantity = converted.quantity as number;

    if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) {
      // Local edit to some OTHER field (name, category, ...) is newer and wins for those
      // columns, but quantity still adopts the server's authoritative number.
      await tx.update(inventoryItems).set({ quantity }).where(eq(inventoryItems.id, id));
      continue;
    }

    const { id: _id, ...setFields } = converted;
    await tx.update(inventoryItems).set(setFields).where(eq(inventoryItems.id, id));
  }

  for (const { key, table } of APPEND_ONLY_TABLES) {
    for (const row of pulledData[key] ?? []) {
      await applyAppendOnlyRow(tx, table, row as Record<string, unknown>);
    }
  }

  // orders: last-write-wins decides whether to apply each order; if it applies, ALL of that
  // order's current children replace whatever this device has for it, matching how the push
  // side already resends an order's children in full whenever the order itself is dirty rather
  // than diffing them individually.
  const orderRows = pulledData.orders ?? [];
  const appliedOrderIds = new Set<string>();
  for (const row of orderRows) {
    const converted = snakeRowToDrizzle(orders, row as Record<string, unknown>);
    const id = converted.id as string;
    const incomingUpdatedAt = converted.updatedAt as Date;

    const existing = await tx.select({ updatedAt: orders.updatedAt }).from(orders).where(eq(orders.id, id)).limit(1);
    const localUpdatedAt = existing.length > 0 ? existing[0].updatedAt : null;
    if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) continue;

    const { id: _id, ...setFields } = converted;
    await tx.insert(orders).values(converted as any).onConflictDoUpdate({ target: orders.id, set: setFields });
    appliedOrderIds.add(id);
  }

  for (const { key, table } of ORDER_CHILD_TABLES) {
    for (const row of pulledData[key] ?? []) {
      const rawRow = row as Record<string, unknown>;
      // Read order_id off the RAW (snake_case) pulled row, not the converted one: the cloud
      // order_item_modifiers table carries order_id purely so the server's pull query can do
      // `.in('order_id', changedOrderIds)` (see api/src/index.ts), but the local
      // orderItemModifiers schema has no orderId column at all (it only has orderItemId) --
      // snakeRowToDrizzle silently drops any cloud column with no local counterpart, so
      // converted.orderId would always be undefined here and no orderItemModifiers row would
      // ever pass the appliedOrderIds gate below.
      const orderId = rawRow.order_id as string | undefined;
      if (!orderId || !appliedOrderIds.has(orderId)) continue;

      const converted = snakeRowToDrizzle(table, rawRow);
      const { id: _id, ...setFields } = converted;
      await tx
        .insert(table)
        .values(converted as any)
        .onConflictDoUpdate({ target: (table as unknown as { id: AnySQLiteColumn }).id, set: setFields });
    }
  }
}
