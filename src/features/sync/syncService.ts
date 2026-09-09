import { eq, inArray } from 'drizzle-orm';
import Constants from 'expo-constants';
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
  inventoryItems,
  recipeIngredients,
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
import { logSyncAttempt } from './syncLogService';

/**
 * Phase 8.5: Supabase Backend Edition
 * This is a one-way (local -> backend), manually-triggered backup push.
 * Authentication: restaurantId + PIN (verified server-side)
 * No Firestore access. All data goes to Supabase PostgreSQL via API.
 */
export interface SyncResult {
  pushedCounts: Record<string, number>;
  syncedAt: Date;
}

// Backend URL is configured once per build in app.json's extra.supabaseApiUrl — not something
// an individual restaurant enters, since every restaurant shares the same backend.
function getApiUrl(): string {
  const apiUrl = Constants.expoConfig?.extra?.supabaseApiUrl as string | undefined;
  if (!apiUrl) {
    throw new Error('Cloud sync is not configured for this app build. Contact support.');
  }
  return apiUrl;
}

/**
 * Call Supabase API backend for multi-tenant sync
 * Server verifies PIN against Supabase staff table and restaurant enabled status
 */
async function callSupabaseSync(
  restaurantId: string,
  pin: string,
  syncData: Record<string, unknown>,
): Promise<{ pushedCounts: Record<string, number> }> {
  const response = await fetch(`${getApiUrl()}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      pin,
      syncData,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${await readErrorMessage(response)}`);
  }

  const result = (await response.json()) as { pushedCounts: Record<string, number> };
  return result;
}

/**
 * The server always tries to answer with JSON, but a few failure modes never reach our own
 * error handler (a proxy/host-level 502, a body-size limit rejected before this build's fix
 * shipped, etc.) and come back as an HTML or plain-text page instead. Blindly calling
 * response.json() on those throws a "Unexpected character: <" parse error that hides the
 * actual problem, so fall back to the response's status line when the body isn't JSON.
 */
async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text);
    return parsed.error || response.statusText || `HTTP ${response.status}`;
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}

export interface PushStaffInput {
  restaurantId: string;
  /** PIN of the staff member performing the edit — must already exist in the cloud staff
   * table (normally the owner, created there at registration time). */
  authPin: string;
  staffId: string;
  name: string;
  role: string;
  /** Omit on an edit that doesn't change the PIN. */
  pin?: string;
}

/**
 * Push a locally-created/edited staff member to the cloud staff table. Staff management
 * (Settings > Staff) is otherwise entirely local and never part of the regular sync payload —
 * this is the only path that makes a staff member usable for pairing another device or visible
 * in the admin panel. Best-effort: callers should treat failure as non-fatal to the local save.
 */
export async function pushStaffToCloud(input: PushStaffInput): Promise<void> {
  const response = await fetch(`${getApiUrl()}/staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export interface SubscriptionReminder {
  tier: string;
  message: string;
  nextDueDate: string;
}

export interface RestaurantStatus {
  /** false if the request couldn't even reach the server (offline, DNS, timeout, etc). */
  online: boolean;
  /** Only meaningful when online is true. */
  enabled?: boolean;
  reason?: string;
  /** Present whenever the server has a payment reminder to show -- absent (not just null) when
   * offline, no plan is set, or the account is fully caught up. */
  subscriptionReminder?: SubscriptionReminder | null;
}

/**
 * Lightweight probe used at login (and before an auto-sync) to check whether the
 * restaurant is currently enabled, without pushing a full sync payload. Never throws —
 * a network failure just means "we can't tell right now", which callers treat as
 * "assume offline, don't block anything local".
 */
export async function checkRestaurantStatus(
  restaurantId: string,
  pin: string,
): Promise<RestaurantStatus> {
  let apiUrl: string;
  try {
    apiUrl = getApiUrl();
  } catch {
    return { online: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${apiUrl}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, pin, syncData: {}, checkOnly: true }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.status === 401) {
      const body = await response.json().catch(() => ({}));
      return {
        online: true,
        enabled: false,
        reason: body.error || 'Restaurant is currently disabled',
      };
    }
    if (!response.ok) {
      // Includes 404 ("this restaurant doesn't exist in the cloud" -- true for every
      // locally-created "Start Fresh" restaurant that was never registered) and 5xx errors.
      // Neither means the restaurant is disabled, so don't block login on it -- treat it the
      // same as not being able to reach the server at all.
      return { online: false };
    }
    const body = await response.json().catch(() => ({}));
    return { online: true, enabled: true, subscriptionReminder: body.subscriptionReminder ?? null };
  } catch {
    return { online: false };
  }
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
    filterChangedSince(
      orderRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
      lastSyncedAt,
    ).length +
    filterChangedSince(
      menuItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
      lastSyncedAt,
    ).length +
    filterChangedSince(
      categoryRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
      lastSyncedAt,
    ).length
  );
}

// A first-ever sync for a real menu (hundreds of rows) now batches into a handful of requests
// server-side rather than one per row, but that's still several sequential round-trips over
// whatever connection the device has -- 20s cut it too close even in the common case.
const SYNC_TIMEOUT_MS = 45000;

/**
 * The Supabase API might be slow or unreachable. Race the whole operation
 * against a timeout so a bad config always surfaces a clear error instead
 * of hanging forever.
 */
export async function syncNow(
  restaurantId: string,
  pin: string,
  triggeredBy: 'manual' | 'auto' = 'manual',
): Promise<SyncResult> {
  const startedAt = new Date();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Sync timed out. Check your connection and try again.')),
      SYNC_TIMEOUT_MS,
    );
  });
  try {
    const result = await Promise.race([syncNowInternal(restaurantId, pin), timeout]);
    await logSyncAttempt({
      restaurantId,
      triggeredBy,
      status: 'success',
      pushedCounts: result.pushedCounts,
      startedAt,
    });
    return result;
  } catch (err) {
    await logSyncAttempt({
      restaurantId,
      triggeredBy,
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      startedAt,
    });
    throw err;
  } finally {
    clearTimeout(timer!);
  }
}

async function syncNowInternal(restaurantId: string, pin: string): Promise<SyncResult> {
  const lastSyncedAt = await getLastSyncedAt(restaurantId);
  const syncData: Record<string, unknown> = {};

  // Collect all changed data from local DB
  const restaurant = await db.query.restaurants.findFirst({
    where: eq(restaurants.id, restaurantId),
  });
  if (restaurant) {
    syncData.restaurants = filterChangedSince(
      [{ ...restaurant, changedAt: restaurant.updatedAt }],
      lastSyncedAt,
    );
  }

  const categoryRows = await db.query.categories.findMany({
    where: eq(categories.restaurantId, restaurantId),
  });
  syncData.categories = filterChangedSince(
    categoryRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const menuItemRows = await db.query.menuItems.findMany({
    where: eq(menuItems.restaurantId, restaurantId),
  });
  syncData.menuItems = filterChangedSince(
    menuItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const modifierGroupRows = await db.query.modifierGroups.findMany({
    where: eq(modifierGroups.restaurantId, restaurantId),
  });
  syncData.modifierGroups = filterChangedSince(
    modifierGroupRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  // These four are child rows of an already-filtered parent (a modifier group, a menu item, a
  // tax rule, a combo deal) but each now carries its own createdAt/updatedAt, so they get
  // diffed the same way as everything else instead of being resent in full on every sync
  // regardless of whether anything in them actually changed -- see migration 0010 for why that
  // used to be the single biggest contributor to "why is sync pushing so much for so little."
  const modifierGroupIds = modifierGroupRows.map((g) => g.id);
  const modifierRows = modifierGroupIds.length
    ? await db.query.modifiers.findMany({
        where: inArray(modifiers.modifierGroupId, modifierGroupIds),
      })
    : [];
  syncData.modifiers = filterChangedSince(
    modifierRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const menuItemIds = menuItemRows.map((i) => i.id);
  const menuItemModifierGroupRows = menuItemIds.length
    ? await db.query.menuItemModifierGroups.findMany({
        where: inArray(menuItemModifierGroups.menuItemId, menuItemIds),
      })
    : [];
  // No `id` column (composite PK on menuItemId+modifierGroupId), so this can't go through
  // filterChangedSince's TimestampedRow-typed helper -- filter directly on createdAt instead.
  syncData.menuItemModifierGroups =
    lastSyncedAt === null
      ? menuItemModifierGroupRows
      : menuItemModifierGroupRows.filter((r) => r.createdAt.getTime() > lastSyncedAt.getTime());

  const inventoryItemRows = await db.query.inventoryItems.findMany({
    where: eq(inventoryItems.restaurantId, restaurantId),
  });
  syncData.inventoryItems = filterChangedSince(
    inventoryItemRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const recipeIngredientRows = menuItemIds.length
    ? await db.query.recipeIngredients.findMany({
        where: inArray(recipeIngredients.menuItemId, menuItemIds),
      })
    : [];
  syncData.recipeIngredients = filterChangedSince(
    recipeIngredientRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const taxRuleRows = await db.query.taxRules.findMany({
    where: eq(taxRules.restaurantId, restaurantId),
  });
  syncData.taxRules = filterChangedSince(
    taxRuleRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const taxRuleIds = taxRuleRows.map((r) => r.id);
  const taxComponentRows = taxRuleIds.length
    ? await db.query.taxComponents.findMany({ where: inArray(taxComponents.taxRuleId, taxRuleIds) })
    : [];
  syncData.taxComponents = filterChangedSince(
    taxComponentRows.map((r) => ({ ...r, changedAt: r.createdAt })),
    lastSyncedAt,
  );

  const comboRows = await db.query.comboDeals.findMany({
    where: eq(comboDeals.restaurantId, restaurantId),
  });
  syncData.comboDeals = filterChangedSince(
    comboRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const comboIds = comboRows.map((c) => c.id);
  const comboDealItemRows = comboIds.length
    ? await db.query.comboDealItems.findMany({
        where: inArray(comboDealItems.comboDealId, comboIds),
      })
    : [];
  syncData.comboDealItems = filterChangedSince(
    comboDealItemRows.map((r) => ({ ...r, changedAt: r.createdAt })),
    lastSyncedAt,
  );

  const tableRows = await db.query.diningTables.findMany({
    where: eq(diningTables.restaurantId, restaurantId),
  });
  syncData.diningTables = filterChangedSince(
    tableRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );

  const orderRows = await db.query.orders.findMany({
    where: eq(orders.restaurantId, restaurantId),
  });
  // Every order mutation (a new item, a quantity change, a discount, a payment, a void) runs
  // through recalculateOrderTotals or its own update, both of which always bump the parent
  // order's updatedAt -- so an order absent from this changed-since-lastSync set cannot have any
  // new/changed items, modifiers, discounts, or payments either. Scoping the queries below to
  // *changed* orders only (not every order this restaurant has ever placed) is what keeps a full
  // sync payload from growing forever as order history piles up -- resending the entire history
  // on every sync was the real cause of ever-growing "Pending changes" counts and payload-size
  // failures, not anything about the connection itself.
  const changedOrderRows = filterChangedSince(
    orderRows.map((r) => ({ ...r, changedAt: r.updatedAt })),
    lastSyncedAt,
  );
  syncData.orders = changedOrderRows;

  const orderIds = changedOrderRows.map((o) => o.id);
  if (orderIds.length) {
    const orderItemRows = await db.query.orderItems.findMany({
      where: inArray(orderItems.orderId, orderIds),
    });
    syncData.orderItems = orderItemRows;

    const orderItemIds = orderItemRows.map((i) => i.id);
    syncData.orderItemModifiers = orderItemIds.length
      ? await db.query.orderItemModifiers.findMany({
          where: inArray(orderItemModifiers.orderItemId, orderItemIds),
        })
      : [];

    syncData.discounts = await db.query.discounts.findMany({
      where: inArray(discounts.orderId, orderIds),
    });
    syncData.payments = await db.query.payments.findMany({
      where: inArray(payments.orderId, orderIds),
    });
  } else {
    syncData.orderItems = [];
    syncData.orderItemModifiers = [];
    syncData.discounts = [];
    syncData.payments = [];
  }

  const auditRows = await db.query.auditLogs.findMany({
    where: eq(auditLogs.restaurantId, restaurantId),
  });
  syncData.auditLogs = filterChangedSince(
    auditRows.map((r) => ({ ...r, changedAt: r.createdAt })),
    lastSyncedAt,
  );

  // Call Supabase API to sync (server handles all PostgreSQL writes)
  const result = await callSupabaseSync(restaurantId, pin, syncData);

  const syncedAt = new Date();
  await setLastSyncedAt(restaurantId, syncedAt);

  return { pushedCounts: result.pushedCounts, syncedAt };
}
