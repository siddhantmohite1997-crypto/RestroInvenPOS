import { eq } from 'drizzle-orm';
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

/**
 * Attaches this device to an existing cloud restaurant instead of creating a fresh
 * local one. Verifies restaurantId + PIN against the backend (same Supabase project
 * the admin panel registers restaurants into), then seeds a matching local restaurant
 * + staff row so the user can log in with the PIN they just typed. The cloud's PIN hash
 * (unsalted SHA-256, server-only) is never exposed — we re-hash the PIN locally with
 * the app's own salted scheme, same as createLocalRestaurant() does.
 */
export async function pairWithRestaurant(input: PairInput): Promise<void> {
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
  await db.insert(users).values({
    id: generateId(),
    restaurantId: restaurant.id,
    name: staff.name,
    pinHash,
    pinSalt: salt,
    role: staff.role,
    isActive: true,
  });
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
