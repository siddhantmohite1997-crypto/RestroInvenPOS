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
  users,
} from '@/db/schema';
import { generateId } from '@/lib/id';
import { createSalt, hashPin } from '@/features/auth/pin';
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

/** Order children that carry their own order_id and are therefore gated directly on which
 * orders were applied. orderItemModifiers is deliberately NOT in this list: the cloud
 * order_item_modifiers table has no order_id column at all (it's keyed by order_item_id only --
 * see supabase/schema.sql), so it's applied separately below, gated on the order-item ids this
 * same pull just applied. orderItems stays first: order_item_modifiers and discounts both have
 * FKs into it. */
const ORDER_CHILD_TABLES_BY_ORDER_ID: { key: string; table: SQLiteTable }[] = [
  { key: 'orderItems', table: orderItems },
  { key: 'discounts', table: discounts },
  { key: 'payments', table: payments },
];

/** Applies one table's pulled rows, naming the table and the offending row id if anything
 * throws. Without this, an FK-ordering mistake anywhere in applyPulledData surfaces only as a
 * bare SQLite "FOREIGN KEY constraint failed" that rolls back the entire pull transaction --
 * and since setLastPulledAt is never reached after a rollback, the device retries the identical
 * failing payload forever. Logging which table and row did it makes that diagnosable from a log
 * instead of only from a code read. Still rethrows: a partially-applied pull must not commit. */
async function applyRowsLogged(
  key: string,
  rows: unknown[],
  apply: (rawRow: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  for (const row of rows) {
    const rawRow = row as Record<string, unknown>;
    try {
      await apply(rawRow);
    } catch (err) {
      console.error(
        `applyPulledData: failed applying ${key} row id=${String(rawRow.id ?? '(none)')}`,
        err,
      );
      throw err;
    }
  }
}

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

/** One row of the cloud `staff` table as the pull sends it. Mirrors CloudStaffRow in
 * setupService.ts, which /restore already hands the same shape to. */
interface PulledStaffRow {
  id: string;
  restaurant_id: string;
  name: string;
  role: 'owner' | 'admin' | 'cashier' | null;
  pin_hash: string;
}

/** Inserts a placeholder local `users` row for every pulled staff id this device doesn't already
 * have, so the NOT NULL staff FKs on orders/discounts/payments/auditLogs resolve later in this
 * same pull transaction. Same shape restoreFromCloud() builds for its `otherStaff` rows -- see
 * the long comment at the call site in applyPulledData for why this never updates an existing
 * row. */
async function applyStaffPlaceholders(tx: Tx, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;

  const staffRows = rows as PulledStaffRow[];
  const existing = await tx.select({ id: users.id }).from(users);
  const knownIds = new Set(existing.map((u) => u.id));
  const unknown = staffRows.filter((s) => s.id && !knownIds.has(s.id));
  if (unknown.length === 0) return;

  const placeholderRows = await Promise.all(
    unknown.map(async (s) => {
      const pinSalt = await createSalt();
      // Never matches a real PIN on its own -- this device doesn't know this staff member's
      // actual PIN. Their real first login here goes through the cloudPinHash bridge (see
      // tryCloudPinFallback in authService.ts), which then replaces this placeholder with a
      // proper salted hash.
      const pinHash = await hashPin(generateId(), pinSalt);
      return {
        id: s.id,
        restaurantId: s.restaurant_id,
        name: s.name,
        pinHash,
        pinSalt,
        cloudPinHash: s.pin_hash,
        // The cloud column is nullable (DEFAULT 'cashier', see supabase/schema.sql) while the
        // local one is NOT NULL -- fall back rather than letting a null role NULL-constraint the
        // pull into the exact retry-forever loop this whole block exists to prevent.
        role: s.role ?? ('cashier' as const),
        // No is_active column on the cloud staff table (no soft-delete there) -- every pulled
        // staff row is treated as active, same reasoning restoreFromCloud uses.
        isActive: true,
      };
    }),
  );

  // One batched insert for the whole set, like restoreFromCloud does, rather than one per row.
  try {
    await tx.insert(users).values(placeholderRows).onConflictDoNothing();
  } catch (err) {
    console.error(
      `applyPulledData: failed inserting staff placeholder rows ids=${placeholderRows
        .map((r) => r.id)
        .join(',')}`,
      err,
    );
    throw err;
  }
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
  await applyRowsLogged('restaurants', pulledData.restaurants ?? [], (rawRow) =>
    applyLastWriteWinsRow(tx, restaurants, rawRow),
  );

  // staff runs SECOND, right after restaurants (which it FK-references) and before EVERYTHING
  // else, and the position is load bearing. orders.openedByStaffId, discounts.appliedByStaffId,
  // payments.receivedByStaffId and auditLogs.staffId are all NOT NULL FKs into the local `users`
  // table, and this app runs with PRAGMA foreign_keys = ON (see src/db/client.ts). Staff has
  // never been part of the generic pull (staff is pushed through POST /staff, and a device only
  // ever learned the roster from the one-time /pair or /restore), so a staff member added on
  // another device was permanently unknown here: the first pulled order/discount/payment/audit
  // log referencing them failed the FK, rolled back the WHOLE pull transaction, never reached
  // setLastPulledAt, and made this device retry the identical failing payload on every tick
  // forever. The server now sends the full roster on every pull (it has no updated_at column to
  // filter on -- see supabase/schema.sql) and we materialise any id we've never seen as a
  // placeholder `users` row here, so every later FK in this transaction resolves.
  //
  // DELIBERATELY NOT FULL STAFF SYNC: this only ever INSERTS rows for staff ids this device has
  // never seen. Edits to an already-known staff member (name, role, or PIN changes made on
  // another device) are NOT propagated -- that needs its own conflict-semantics design decision
  // (a local row may hold this very device's own logged-in staff member with a real salted PIN
  // hash they set here) and is explicitly out of scope. Hence onConflictDoNothing below: an
  // existing local users row is never overwritten, only genuinely-unknown ids are added.
  await applyStaffPlaceholders(tx, pulledData.staff ?? []);

  // inventoryItems runs HERE, before the last-write-wins loop below, and the order is load
  // bearing: recipe_ingredients.inventory_item_id is a NOT NULL FK into inventory_items and
  // this app runs with PRAGMA foreign_keys = ON (see src/db/client.ts), so a pull batch that
  // carries both a brand-new inventory item and a brand-new recipe ingredient pointing at it
  // used to blow up on the FK, roll back the WHOLE pull transaction, never reach
  // setLastPulledAt, and then retry the identical failing payload on every tick forever.
  // inventory_items itself only references restaurants (applied just above), so it is FK-safe
  // in this position. Don't move it back down.
  //
  // Merge rule: every column except quantity follows the normal last-write-wins rule; quantity
  // itself is always adopted from the server, since POST /inventory/adjust-stock has made the
  // server the sole authority for it (see the spec's Part 2).
  await applyRowsLogged('inventoryItems', pulledData.inventoryItems ?? [], async (rawRow) => {
    const converted = snakeRowToDrizzle(inventoryItems, rawRow);
    const id = converted.id as string;
    const incomingUpdatedAt = converted.updatedAt as Date;

    const existing = await tx
      .select({ updatedAt: inventoryItems.updatedAt, quantity: inventoryItems.quantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(inventoryItems).values(converted as any).onConflictDoNothing();
      return;
    }

    const localUpdatedAt = existing[0].updatedAt;
    // quantity always adopts the server's value regardless of the last-write-wins outcome for
    // every other column -- computed once, applied whichever branch below runs.
    const quantity = converted.quantity as number;

    if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) {
      // Local edit to some OTHER field (name, category, ...) is newer and wins for those
      // columns, but quantity still adopts the server's authoritative number.
      await tx.update(inventoryItems).set({ quantity }).where(eq(inventoryItems.id, id));
      return;
    }

    const { id: _id, ...setFields } = converted;
    await tx.update(inventoryItems).set(setFields).where(eq(inventoryItems.id, id));
  });

  for (const { key, table } of LAST_WRITE_WINS_TABLES) {
    await applyRowsLogged(key, pulledData[key] ?? [], (rawRow) =>
      applyLastWriteWinsRow(tx, table, rawRow),
    );
  }

  for (const { key, table } of APPEND_ONLY_TABLES) {
    await applyRowsLogged(key, pulledData[key] ?? [], (rawRow) =>
      applyAppendOnlyRow(tx, table, rawRow),
    );
  }

  // orders: last-write-wins decides whether to apply each order; if it applies, ALL of that
  // order's current children replace whatever this device has for it, matching how the push
  // side already resends an order's children in full whenever the order itself is dirty rather
  // than diffing them individually.
  const appliedOrderIds = new Set<string>();
  await applyRowsLogged('orders', pulledData.orders ?? [], async (rawRow) => {
    const converted = snakeRowToDrizzle(orders, rawRow);
    const id = converted.id as string;
    const incomingUpdatedAt = converted.updatedAt as Date;

    const existing = await tx.select({ updatedAt: orders.updatedAt }).from(orders).where(eq(orders.id, id)).limit(1);
    const localUpdatedAt = existing.length > 0 ? existing[0].updatedAt : null;
    if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) return;

    const { id: _id, ...setFields } = converted;
    await tx.insert(orders).values(converted as any).onConflictDoUpdate({ target: orders.id, set: setFields });
    appliedOrderIds.add(id);
  });

  // Ids of the order_items this pull actually applied -- the gate for order_item_modifiers
  // below, which has no order_id of its own to be gated on.
  const appliedOrderItemIds = new Set<string>();

  for (const { key, table } of ORDER_CHILD_TABLES_BY_ORDER_ID) {
    await applyRowsLogged(key, pulledData[key] ?? [], async (rawRow) => {
      // Read order_id off the RAW (snake_case) pulled row, not the converted one -- these three
      // tables all carry it in the cloud, and snakeRowToDrizzle would only preserve it for
      // tables that also have a local orderId column.
      const orderId = rawRow.order_id as string | undefined;
      if (!orderId || !appliedOrderIds.has(orderId)) return;

      const converted = snakeRowToDrizzle(table, rawRow);
      const { id: _id, ...setFields } = converted;
      await tx
        .insert(table)
        .values(converted as any)
        .onConflictDoUpdate({ target: (table as unknown as { id: AnySQLiteColumn }).id, set: setFields });
      if (key === 'orderItems') appliedOrderItemIds.add(converted.id as string);
    });
  }

  // orderItemModifiers is gated on order_item_id, NOT order_id: the cloud order_item_modifiers
  // table has no order_id column at all (supabase/schema.sql keys it by order_item_id only), so
  // the previous `rawRow.order_id` gate here read undefined on every row and silently dropped
  // every pulled modifier. Gating on the order-item ids applied just above is equivalent in
  // intent (a modifier is only meaningful alongside the order-item version it belongs to) and
  // also guarantees its NOT NULL FK into order_items is satisfied.
  await applyRowsLogged('orderItemModifiers', pulledData.orderItemModifiers ?? [], async (rawRow) => {
    const orderItemId = rawRow.order_item_id as string | undefined;
    if (!orderItemId || !appliedOrderItemIds.has(orderItemId)) return;

    const converted = snakeRowToDrizzle(orderItemModifiers, rawRow);
    const { id: _id, ...setFields } = converted;
    await tx
      .insert(orderItemModifiers)
      .values(converted as any)
      .onConflictDoUpdate({ target: orderItemModifiers.id, set: setFields });
  });
}
