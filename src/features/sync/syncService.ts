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
import { getLastSyncedAt, setLastSyncedAt } from './syncConfig';
import { filterChangedSince } from './syncDiff';

/**
 * Phase 8.5: Cloud Function Backend
 * This is a one-way (local -> backend), manually-triggered backup push.
 * Authentication: restaurantId + PIN (verified server-side)
 * No direct Firestore access from app. All writes go through Cloud Function.
 */
export interface SyncResult {
  pushedCounts: Record<string, number>;
  syncedAt: Date;
}

/**
 * Call Cloud Function backend for multi-tenant sync
 * Server verifies PIN against staff records and restaurant enabled status
 */
async function callCloudFunctionSync(
  restaurantId: string,
  pin: string,
  syncData: Record<string, unknown>,
): Promise<{ pushedCounts: Record<string, number> }> {
  // Get Cloud Function URL from environment
  const functionUrl = process.env.EXPO_PUBLIC_SYNC_FUNCTION_URL;
  if (!functionUrl) {
    throw new Error('Sync backend URL not configured. Add EXPO_PUBLIC_SYNC_FUNCTION_URL to app.json');
  }

  const response = await fetch(`${functionUrl}/syncRestaurant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      pin,
      syncData,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Sync failed: ${error.error?.message || response.statusText}`);
  }

  const result = (await response.json()) as { data: { pushedCounts: Record<string, number> } };
  return result.data;
}

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
      () => reject(new Error('Sync timed out. Check your Cloud Function config and connection, then try again.')),
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
  // Get the stored PIN (from auth context or app storage)
  // TODO: Get PIN from AuthContext or secure storage
  const pin = process.env.EXPO_PUBLIC_STAFF_PIN || '';
  if (!pin) {
    throw new Error('Staff PIN not configured. Please log in first.');
  }

  const lastSyncedAt = await getLastSyncedAt(restaurantId);
  const syncData: Record<string, unknown> = {};

  // Collect all changed data from local DB
  const restaurant = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
  if (restaurant) {
    syncData.restaurants = filterChangedSince([{ ...restaurant, changedAt: restaurant.updatedAt }], lastSyncedAt);
  }

  const categoryRows = await db.query.categories.findMany({ where: eq(categories.restaurantId, restaurantId) });
  syncData.categories = filterChangedSince(categoryRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);

  const menuItemRows = await db.query.menuItems.findMany({ where: eq(menuItems.restaurantId, restaurantId) });
  syncData.menuItems = filterChangedSince(menuItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);

  const modifierGroupRows = await db.query.modifierGroups.findMany({
    where: eq(modifierGroups.restaurantId, restaurantId),
  });
  syncData.modifierGroups = filterChangedSince(
    modifierGroupRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const modifierGroupIds = modifierGroupRows.map((g) => g.id);
  syncData.modifiers = modifierGroupIds.length
    ? await db.query.modifiers.findMany({ where: inArray(modifiers.modifierGroupId, modifierGroupIds) })
    : [];

  const menuItemIds = menuItemRows.map((i) => i.id);
  syncData.menuItemModifierGroups = menuItemIds.length
    ? await db.query.menuItemModifierGroups.findMany({ where: inArray(menuItemModifierGroups.menuItemId, menuItemIds) })
    : [];

  const taxRuleRows = await db.query.taxRules.findMany({ where: eq(taxRules.restaurantId, restaurantId) });
  syncData.taxRules = filterChangedSince(taxRuleRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);

  const taxRuleIds = taxRuleRows.map((r) => r.id);
  syncData.taxComponents = taxRuleIds.length
    ? await db.query.taxComponents.findMany({ where: inArray(taxComponents.taxRuleId, taxRuleIds) })
    : [];

  const comboRows = await db.query.comboDeals.findMany({ where: eq(comboDeals.restaurantId, restaurantId) });
  syncData.comboDeals = filterChangedSince(comboRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);

  const comboIds = comboRows.map((c) => c.id);
  syncData.comboDealItems = comboIds.length
    ? await db.query.comboDealItems.findMany({ where: inArray(comboDealItems.comboDealId, comboIds) })
    : [];

  const tableRows = await db.query.diningTables.findMany({ where: eq(diningTables.restaurantId, restaurantId) });
  syncData.diningTables = filterChangedSince(tableRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);

  const orderRows = await db.query.orders.findMany({ where: eq(orders.restaurantId, restaurantId) });
  syncData.orders = filterChangedSince(orderRows.map((r) => ({ ...r, changedAt: r.updatedAt })), lastSyncedAt);

  const orderIds = orderRows.map((o) => o.id);
  if (orderIds.length) {
    const orderItemRows = await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, orderIds) });
    syncData.orderItems = filterChangedSince(
      orderItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
      lastSyncedAt,
    );

    const orderItemIds = orderItemRows.map((i) => i.id);
    syncData.orderItemModifiers = orderItemIds.length
      ? await db.query.orderItemModifiers.findMany({ where: inArray(orderItemModifiers.orderItemId, orderItemIds) })
      : [];

    syncData.discounts = await db.query.discounts.findMany({ where: inArray(discounts.orderId, orderIds) });
    syncData.payments = await db.query.payments.findMany({ where: inArray(payments.orderId, orderIds) });
  }

  const auditRows = await db.query.auditLogs.findMany({ where: eq(auditLogs.restaurantId, restaurantId) });
  syncData.auditLogs = filterChangedSince(auditRows.map((r) => ({ ...r, changedAt: r.createdAt })), lastSyncedAt);

  // Call Cloud Function to sync (server handles all Firestore writes)
  const result = await callCloudFunctionSync(restaurantId, pin, syncData);

  const syncedAt = new Date();
  await setLastSyncedAt(restaurantId, syncedAt);

  return { pushedCounts: result.pushedCounts, syncedAt };
}
