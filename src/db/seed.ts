import { db } from './client';
import { restaurants, users, taxRules, categories } from './schema';
import { generateId } from '@/lib/id';
import { createSalt, hashPin } from '@/features/auth/pin';

/**
 * ASSUMPTION: on first launch (empty DB) we bootstrap a single default restaurant, one
 * "Owner" staff account with PIN 1234, a 0% default tax rule, and a "General" category —
 * so the app is usable immediately without an onboarding wizard. Business details, PIN,
 * and tax rules are all editable from Settings/Menu once built (Phase 2/6). Flagging this
 * as a business-logic assumption per the project brief — confirm or correct the defaults.
 */
export async function ensureBootstrapped(): Promise<void> {
  const existing = await db.query.restaurants.findFirst();
  if (existing) return;

  const restaurantId = generateId();
  await db.insert(restaurants).values({
    id: restaurantId,
    name: 'My Restaurant',
    country: 'IN',
    currencyCode: 'INR',
    currencySymbol: '₹',
    roundingRule: 'nearest_1',
  });

  const salt = await createSalt();
  const pinHash = await hashPin('1234', salt);
  await db.insert(users).values({
    id: generateId(),
    restaurantId,
    name: 'Owner',
    pinHash,
    pinSalt: salt,
    role: 'owner',
    isActive: true,
  });

  const defaultTaxRuleId = generateId();
  await db.insert(taxRules).values({
    id: defaultTaxRuleId,
    restaurantId,
    name: 'No Tax',
    totalRatePercent: 0,
    isDefault: true,
    isActive: true,
  });

  await db.insert(categories).values({
    id: generateId(),
    restaurantId,
    name: 'General',
    sortOrder: 0,
    isActive: true,
  });
}
