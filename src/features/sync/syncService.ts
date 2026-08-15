import { doc, setDoc } from 'firebase/firestore';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  restaurants,
  categories,
  menuItems,
  modifierGroups,
  modifiers,
  menuItemModifierGroups,
  taxRules,
  taxComponents,
  comboDeals,
  comboDealItems,
  diningTables,
  orders,
  orderItems,
  orderItemModifiers,
  discounts,
  payments,
  auditLogs,
} from '@/db/schema';
import { getFirestoreClient } from './firebaseClient';
import { getFirebaseConfig, getLastSyncedAt, setLastSyncedAt } from './syncConfig';
import { filterChangedSince } from './syncDiff';

/**
 * ASSUMPTION flagged for review: this is a one-way (local -> Firebase), manually-triggered
 * backup push — not bidirectional multi-device real-time sync. Rows are diffed by
 * updatedAt/createdAt against the last sync time where a table has one; small child tables
 * without their own timestamp (modifiers, combo items, order-item modifiers, etc.) are pushed
 * in full each time since they're cheap to resend. The `users` table is deliberately excluded —
 * it holds PIN hashes, and pushing those to Firestore without configuring proper security rules
 * (which this app has no way to do from the client) would be a real credential leak.
 */
export interface SyncResult {
  pushedCounts: Record<string, number>;
  syncedAt: Date;
}

/** Accepts rows possibly tagged with a synthetic `changedAt` (from filterChangedSince) and
 * strips it before writing — that field exists only for local diffing, not for Firestore. */
async function push(firestorePath: string, rows: ({ id: string } & Record<string, unknown>)[]): Promise<void> {
  for (const { changedAt: _changedAt, ...row } of rows) {
    const firestore = pendingFirestore!;
    await setDoc(doc(firestore, firestorePath, row.id), row, { merge: true });
  }
}

// Set once per syncNow() call so push() doesn't need the client threaded through every call site.
let pendingFirestore: Awaited<ReturnType<typeof getFirestoreClient>> | null = null;

/** Lightweight count for the status indicator — checks the highest-traffic tables (orders,
 * menu items, categories) rather than every syncable table, since it just needs to answer
 * "is there anything worth syncing", not produce an exact total. */
export async function getPendingChangeCount(restaurantId: string): Promise<number> {
  const lastSyncedAt = await getLastSyncedAt(restaurantId);

  const [orderRows, menuItemRows, categoryRows] = await Promise.all([
    db.query.orders.findMany({ where: eq(orders.restaurantId, restaurantId) }),
    db.query.menuItems.findMany({ where: eq(menuItems.restaurantId, restaurantId) }),
    db.query.categories.findMany({ where: eq(categories.restaurantId, restaurantId) }),
  ]);

  return (
    filterChangedSince(orderRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt).length +
    filterChangedSince(menuItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt).length +
    filterChangedSince(categoryRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt).length
  );
}

const SYNC_TIMEOUT_MS = 20000;

/**
 * The Firestore JS SDK doesn't reject promptly on bad credentials/unreachable projects — it
 * retries with backoff internally, which would otherwise leave the UI stuck on "Syncing…"
 * indefinitely. Race the whole operation against a timeout so a bad config always surfaces
 * a clear error instead of hanging forever.
 */
export async function syncNow(restaurantId: string): Promise<SyncResult> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Sync timed out. Check your Firebase config and connection, then try again.')),
      SYNC_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([syncNowInternal(restaurantId), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function syncNowInternal(restaurantId: string): Promise<SyncResult> {
  const config = await getFirebaseConfig(restaurantId);
  if (!config) throw new Error('Firebase isn’t configured yet. Add your project details first.');

  pendingFirestore = await getFirestoreClient(config);
  const lastSyncedAt = await getLastSyncedAt(restaurantId);
  const basePath = `restaurants/${restaurantId}`;
  const pushedCounts: Record<string, number> = {};

  const restaurant = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
  if (restaurant) {
    const changed = filterChangedSince([{ ...restaurant, changedAt: restaurant.updatedAt }], lastSyncedAt);
    await push(`${basePath}/meta`, changed);
    pushedCounts.restaurant = changed.length;
  }

  const categoryRows = await db.query.categories.findMany({ where: eq(categories.restaurantId, restaurantId) });
  const changedCategories = filterChangedSince(categoryRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
  await push(`${basePath}/categories`, changedCategories);
  pushedCounts.categories = changedCategories.length;

  const menuItemRows = await db.query.menuItems.findMany({ where: eq(menuItems.restaurantId, restaurantId) });
  const changedMenuItems = filterChangedSince(menuItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
  await push(`${basePath}/menuItems`, changedMenuItems);
  pushedCounts.menuItems = changedMenuItems.length;

  const modifierGroupRows = await db.query.modifierGroups.findMany({ where: eq(modifierGroups.restaurantId, restaurantId) });
  const changedModifierGroups = filterChangedSince(
    modifierGroupRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );
  await push(`${basePath}/modifierGroups`, changedModifierGroups);
  pushedCounts.modifierGroups = changedModifierGroups.length;

  const modifierGroupIds = modifierGroupRows.map((g) => g.id);
  const modifierRows = modifierGroupIds.length
    ? await db.query.modifiers.findMany({ where: inArray(modifiers.modifierGroupId, modifierGroupIds) })
    : [];
  await push(`${basePath}/modifiers`, modifierRows);
  pushedCounts.modifiers = modifierRows.length;

  const menuItemIds = menuItemRows.map((i) => i.id);
  const linkRows = menuItemIds.length
    ? await db.query.menuItemModifierGroups.findMany({ where: inArray(menuItemModifierGroups.menuItemId, menuItemIds) })
    : [];
  await push(
    `${basePath}/menuItemModifierGroups`,
    linkRows.map((r) => ({ id: `${r.menuItemId}_${r.modifierGroupId}`, ...r })),
  );
  pushedCounts.menuItemModifierGroups = linkRows.length;

  const taxRuleRows = await db.query.taxRules.findMany({ where: eq(taxRules.restaurantId, restaurantId) });
  const changedTaxRules = filterChangedSince(taxRuleRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
  await push(`${basePath}/taxRules`, changedTaxRules);
  pushedCounts.taxRules = changedTaxRules.length;

  const taxRuleIds = taxRuleRows.map((r) => r.id);
  const taxComponentRows = taxRuleIds.length
    ? await db.query.taxComponents.findMany({ where: inArray(taxComponents.taxRuleId, taxRuleIds) })
    : [];
  await push(`${basePath}/taxComponents`, taxComponentRows);
  pushedCounts.taxComponents = taxComponentRows.length;

  const comboRows = await db.query.comboDeals.findMany({ where: eq(comboDeals.restaurantId, restaurantId) });
  const changedCombos = filterChangedSince(comboRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
  await push(`${basePath}/comboDeals`, changedCombos);
  pushedCounts.comboDeals = changedCombos.length;

  const comboIds = comboRows.map((c) => c.id);
  const comboItemRows = comboIds.length
    ? await db.query.comboDealItems.findMany({ where: inArray(comboDealItems.comboDealId, comboIds) })
    : [];
  await push(`${basePath}/comboDealItems`, comboItemRows);
  pushedCounts.comboDealItems = comboItemRows.length;

  const tableRows = await db.query.diningTables.findMany({ where: eq(diningTables.restaurantId, restaurantId) });
  const changedTables = filterChangedSince(tableRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
  await push(`${basePath}/tables`, changedTables);
  pushedCounts.tables = changedTables.length;

  const orderRows = await db.query.orders.findMany({ where: eq(orders.restaurantId, restaurantId) });
  const changedOrders = filterChangedSince(orderRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
  await push(`${basePath}/orders`, changedOrders);
  pushedCounts.orders = changedOrders.length;

  const orderIds = orderRows.map((o) => o.id);
  if (orderIds.length) {
    const orderItemRows = await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, orderIds) });
    const changedOrderItems = filterChangedSince(orderItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);
    await push(`${basePath}/orderItems`, changedOrderItems);
    pushedCounts.orderItems = changedOrderItems.length;

    const orderItemIds = orderItemRows.map((i) => i.id);
    const orderItemModifierRows = orderItemIds.length
      ? await db.query.orderItemModifiers.findMany({ where: inArray(orderItemModifiers.orderItemId, orderItemIds) })
      : [];
    await push(`${basePath}/orderItemModifiers`, orderItemModifierRows);
    pushedCounts.orderItemModifiers = orderItemModifierRows.length;

    const discountRows = await db.query.discounts.findMany({ where: inArray(discounts.orderId, orderIds) });
    await push(`${basePath}/discounts`, discountRows);
    pushedCounts.discounts = discountRows.length;

    const paymentRows = await db.query.payments.findMany({ where: inArray(payments.orderId, orderIds) });
    await push(`${basePath}/payments`, paymentRows);
    pushedCounts.payments = paymentRows.length;
  }

  const auditRows = await db.query.auditLogs.findMany({ where: eq(auditLogs.restaurantId, restaurantId) });
  const changedAudit = filterChangedSince(auditRows.map((r) => ({ ...r, changedAt: r.createdAt })), lastSyncedAt);
  await push(`${basePath}/auditLogs`, changedAudit);
  pushedCounts.auditLogs = changedAudit.length;

  const syncedAt = new Date();
  await setLastSyncedAt(restaurantId, syncedAt);
  pendingFirestore = null;

  return { pushedCounts, syncedAt };
}
