import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { restaurants } from '@/db/schema';

export type Restaurant = typeof restaurants.$inferSelect;

export async function setTablesEnabled(restaurantId: string, enabled: boolean): Promise<void> {
  await db
    .update(restaurants)
    .set({ tablesEnabled: enabled, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));
}

export interface BusinessDetailsInput {
  name: string;
  legalName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  taxIdLabel: string;
  taxId?: string;
  currencyCode: string;
  currencySymbol: string;
  invoicePrefix: string;
  invoiceFooterText?: string;
  serviceChargeEnabled: boolean;
  serviceChargePercent: number;
  roundingRule: 'none' | 'nearest_1' | 'nearest_0_5' | 'nearest_5';
}

export async function updateBusinessDetails(restaurantId: string, input: BusinessDetailsInput): Promise<void> {
  await db
    .update(restaurants)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));
}

/** Assigns the next sequential invoice number (e.g. INV-1) and atomically advances the counter. */
export async function nextInvoiceNumber(restaurantId: string): Promise<string> {
  const restaurant = await db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) });
  if (!restaurant) throw new Error('Restaurant not found');

  const invoiceNumber = `${restaurant.invoicePrefix}-${restaurant.nextInvoiceSequence}`;
  await db
    .update(restaurants)
    .set({ nextInvoiceSequence: restaurant.nextInvoiceSequence + 1, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));

  return invoiceNumber;
}
