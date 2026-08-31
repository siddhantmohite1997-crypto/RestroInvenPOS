import { eq, getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import Constants from 'expo-constants';
import { db } from '@/db/client';
import {
  restaurants,
  users,
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
  syncQueue,
  syncLogs,
} from '@/db/schema';
import { generateId } from '@/lib/id';
import { createSalt, hashPin } from '@/features/auth/pin';

export interface PairInput {
  restaurantId: string;
  pin: string;
}

export interface PairResult {
  restaurantId: string;
  /** The id restoreFromCloud() must skip when restoring the rest of the staff roster —
   * this device already has a real local login for this one. */
  staffId: string;
}

/**
 * Attaches this device to an existing cloud restaurant instead of creating a fresh
 * local one. Verifies restaurantId + PIN against the backend (same Supabase project
 * the admin panel registers restaurants into), then seeds a matching local restaurant
 * + staff row so the user can log in with the PIN they just typed. The cloud's PIN hash
 * (unsalted SHA-256, server-only) is never exposed — we re-hash the PIN locally with
 * the app's own salted scheme, same as createLocalRestaurant() does.
 */
export async function pairWithRestaurant(input: PairInput): Promise<PairResult> {
  const apiUrl = Constants.expoConfig?.extra?.supabaseApiUrl as string | undefined;
  if (!apiUrl) {
    throw new Error('Cloud sync is not configured for this app build. Contact support.');
  }

  const response = await fetch(`${apiUrl}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId: input.restaurantId, pin: input.pin }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Could not verify that restaurant ID and PIN.');
  }

  const { restaurant, staff } = (await response.json()) as {
    restaurant: {
      id: string;
      name: string;
      legal_name: string | null;
      address_line1: string | null;
      address_line2: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      country: string;
      phone: string | null;
      email: string | null;
      tax_id_label: string;
      tax_id: string | null;
      currency_code: string;
      currency_symbol: string;
      invoice_footer_text: string | null;
      invoice_prefix: string;
      service_charge_enabled: boolean;
      service_charge_percent: number;
      tables_enabled: boolean;
      rounding_rule: 'none' | 'nearest_1' | 'nearest_0_5' | 'nearest_5';
    };
    staff: { id: string; name: string; role: 'owner' | 'admin' | 'cashier' };
  };

  const restaurantRow = {
    name: restaurant.name,
    legalName: restaurant.legal_name ?? undefined,
    addressLine1: restaurant.address_line1 ?? undefined,
    addressLine2: restaurant.address_line2 ?? undefined,
    city: restaurant.city ?? undefined,
    state: restaurant.state ?? undefined,
    postalCode: restaurant.postal_code ?? undefined,
    country: restaurant.country,
    phone: restaurant.phone ?? undefined,
    email: restaurant.email ?? undefined,
    taxIdLabel: restaurant.tax_id_label,
    taxId: restaurant.tax_id ?? undefined,
    currencyCode: restaurant.currency_code,
    currencySymbol: restaurant.currency_symbol,
    invoiceFooterText: restaurant.invoice_footer_text ?? undefined,
    invoicePrefix: restaurant.invoice_prefix,
    serviceChargeEnabled: restaurant.service_charge_enabled,
    serviceChargePercent: restaurant.service_charge_percent,
    tablesEnabled: restaurant.tables_enabled,
    roundingRule: restaurant.rounding_rule,
  };

  // Upsert rather than insert: re-pairing to a restaurant this device already has a local
  // row for (e.g. retrying after an earlier attempt was interrupted between the restaurant
  // insert and the staff insert below) must not fail on a primary-key conflict.
  await db
    .insert(restaurants)
    .values({ id: restaurant.id, ...restaurantRow })
    .onConflictDoUpdate({ target: restaurants.id, set: restaurantRow });

  // Replace this device's local credential for this restaurant, if it already had one
  // (re-pairing after a PIN reset, or recovering from a previous partial pairing that
  // never got this far) — rather than accumulating a second row that authenticateByPin()
  // would just skip past anyway.
  await db.delete(users).where(eq(users.restaurantId, restaurant.id));

  const salt = await createSalt();
  const pinHash = await hashPin(input.pin, salt);
  // id is the CLOUD staff id, not a fresh local one -- every synced table that references a
  // staff member (orders.openedByStaffId, auditLogs.staffId, discounts.appliedByStaffId, ...)
  // stores that same id, so restoreFromCloud()'s FK-safe inserts only resolve correctly if
  // this device's own staff row uses the id the rest of the restaurant's cloud data already
  // expects, exactly like every locally-created staff member already does when pushed via
  // pushStaffToCloud (which sends the local id as-is).
  await db.insert(users).values({
    id: staff.id,
    restaurantId: restaurant.id,
    name: staff.name,
    pinHash,
    pinSalt: salt,
    role: staff.role,
    isActive: true,
  });

  return { restaurantId: restaurant.id, staffId: staff.id };
}

// ============================================================================
// RESTORE FROM CLOUD
// ============================================================================

/** Mirrors api/src/index.ts's TABLE_MAP key order exactly (FK-safe: parents before children) --
 * restore inserts must walk the same order or a child row's FK target won't exist yet. */
const RESTORE_TABLE_ORDER: { key: string; table: SQLiteTable }[] = [
  { key: 'categories', table: categories },
  { key: 'taxRules', table: taxRules },
  { key: 'taxComponents', table: taxComponents },
  { key: 'menuItems', table: menuItems },
  { key: 'modifierGroups', table: modifierGroups },
  { key: 'modifiers', table: modifiers },
  { key: 'menuItemModifierGroups', table: menuItemModifierGroups },
  { key: 'comboDeals', table: comboDeals },
  { key: 'comboDealItems', table: comboDealItems },
  { key: 'inventoryItems', table: inventoryItems },
  { key: 'recipeIngredients', table: recipeIngredients },
  { key: 'diningTables', table: diningTables },
  { key: 'orders', table: orders },
  { key: 'orderItems', table: orderItems },
  { key: 'orderItemModifiers', table: orderItemModifiers },
  { key: 'discounts', table: discounts },
  { key: 'payments', table: payments },
  { key: 'auditLogs', table: auditLogs },
];

/** Converts one Postgres row (snake_case keys, as Supabase returns them) into the shape
 * Drizzle expects for this table (camelCase keys, proper JS types) by walking the table's own
 * column definitions rather than hardcoding a per-table field map. A cloud column with no local
 * counterpart (e.g. restaurant_id stamped onto child tables purely for cloud-side RLS) is
 * silently skipped; a local column absent from the cloud row (e.g. one added after this
 * restaurant was first synced) is left for its own `.default(...)` to fill in. */
function snakeRowToDrizzle(table: SQLiteTable, snakeRow: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const result: Record<string, unknown> = {};
  for (const [camelKey, column] of Object.entries(columns)) {
    const dbName = column.name;
    if (!(dbName in snakeRow)) continue;
    const raw = snakeRow[dbName];
    if (raw === null || raw === undefined) {
      result[camelKey] = null;
    } else if (column.dataType === 'date') {
      result[camelKey] = new Date(raw as string | number);
    } else if (column.dataType === 'boolean') {
      result[camelKey] = Boolean(raw);
    } else {
      result[camelKey] = raw;
    }
  }
  return result;
}

const RESTORE_INSERT_CHUNK_SIZE = 50;

export interface RestoreResult {
  tablesRestored: number;
  rowsRestored: number;
}

interface CloudStaffRow {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'cashier';
  pin_hash: string;
}

/**
 * Pulls every row this restaurant has in the cloud back onto this device — called right after
 * pairWithRestaurant() succeeds, whether this is a brand new phone or the SAME phone after an
 * uninstall/reinstall wiped local SQLite. Without this, pairing only ever seeded the
 * restaurant's own business-details row and the ONE staff row whose PIN was just typed in;
 * every menu item, inventory item, recipe link, other staff member, tax rule, and order the
 * restaurant had built up stayed invisible on the new device despite sitting in Supabase.
 *
 * `pairedStaffId` is the id of the staff member who just paired this device (== the local
 * users.id pairWithRestaurant() just inserted, now using the cloud staff id too) — their row is
 * skipped here since it already has a real local login, unlike every other restored staff row.
 */
export async function restoreFromCloud(
  restaurantId: string,
  pin: string,
  pairedStaffId: string,
): Promise<RestoreResult> {
  const apiUrl = Constants.expoConfig?.extra?.supabaseApiUrl as string | undefined;
  if (!apiUrl) {
    throw new Error('Cloud sync is not configured for this app build. Contact support.');
  }

  const response = await fetch(`${apiUrl}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, pin }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Could not restore this restaurant's data from the cloud.");
  }

  const { staff, data } = (await response.json()) as {
    staff: CloudStaffRow[];
    data: Record<string, Record<string, unknown>[]>;
  };

  let tablesRestored = 0;
  let rowsRestored = 0;

  await db.transaction(async (tx) => {
    const otherStaff = staff.filter((s) => s.id !== pairedStaffId);
    if (otherStaff.length > 0) {
      const placeholderRows = await Promise.all(
        otherStaff.map(async (s) => {
          const pinSalt = await createSalt();
          // Never matches a real PIN on its own -- this device doesn't know this staff
          // member's actual PIN yet. Their real first login on this device goes through
          // the cloudPinHash bridge (see tryCloudPinFallback in authService.ts), which
          // then replaces this placeholder with a proper salted hash.
          const pinHash = await hashPin(generateId(), pinSalt);
          return {
            id: s.id,
            restaurantId,
            name: s.name,
            pinHash,
            pinSalt,
            cloudPinHash: s.pin_hash,
            role: s.role,
            // No is_active column on the cloud staff table (no soft-delete there) --
            // every restored staff row is treated as active.
            isActive: true,
          };
        }),
      );
      await tx.insert(users).values(placeholderRows).onConflictDoNothing();
      tablesRestored += 1;
      rowsRestored += placeholderRows.length;
    }

    for (const { key, table } of RESTORE_TABLE_ORDER) {
      const rows = data[key] ?? [];
      if (rows.length === 0) continue;
      tablesRestored += 1;
      for (let i = 0; i < rows.length; i += RESTORE_INSERT_CHUNK_SIZE) {
        const chunk = rows
          .slice(i, i + RESTORE_INSERT_CHUNK_SIZE)
          .map((row) => snakeRowToDrizzle(table, row));
        await tx.insert(table).values(chunk).onConflictDoNothing();
      }
      rowsRestored += rows.length;
    }
  });

  return { tablesRestored, rowsRestored };
}

/**
 * Emergency recovery: wipes every local table so the device drops back to the
 * (setup)/welcome screen as if freshly installed. For when pairing has gone wrong in a
 * way daily use can't fix (lost/forgotten PIN, a partial pairing that never got a valid
 * local credential) — reachable from the login screen's "Trouble logging in?" link.
 * Deletes in FK-safe order (children before parents); wrapped in a transaction so a
 * failure partway through can't leave the device in a worse, half-wiped state.
 */
export async function resetDeviceSetup(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(orderItemModifiers);
    await tx.delete(discounts);
    await tx.delete(payments);
    await tx.delete(orderItems);
    await tx.delete(orders);
    await tx.delete(auditLogs);
    await tx.delete(recipeIngredients);
    await tx.delete(inventoryItems);
    await tx.delete(comboDealItems);
    await tx.delete(menuItemModifierGroups);
    await tx.delete(modifiers);
    await tx.delete(modifierGroups);
    await tx.delete(menuItems);
    await tx.delete(comboDeals);
    await tx.delete(taxComponents);
    await tx.delete(taxRules);
    await tx.delete(categories);
    await tx.delete(diningTables);
    await tx.delete(users);
    await tx.delete(restaurants);
    await tx.delete(syncQueue);
    await tx.delete(syncLogs);
  });
}
