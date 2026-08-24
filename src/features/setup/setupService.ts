import Constants from 'expo-constants';
import { db } from '@/db/client';
import { restaurants, users } from '@/db/schema';
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

  await db.insert(restaurants).values({
    id: restaurant.id,
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
  });

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
