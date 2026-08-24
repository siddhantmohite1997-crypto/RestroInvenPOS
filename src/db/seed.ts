import { db } from './client';
import { restaurants, users, taxRules, categories } from './schema';
import { generateId } from '@/lib/id';
import { createSalt, hashPin } from '@/features/auth/pin';

export async function hasRestaurant(): Promise<boolean> {
  const existing = await db.query.restaurants.findFirst();
  return !!existing;
}

/**
 * Sets up a brand-new, purely local restaurant on this device — "My Restaurant", one
 * "Owner" staff account with PIN 1234, a 0% default tax rule, and a "General" category —
 * so the app is usable immediately without a wizard. Business details, PIN, and tax rules
 * are all editable from Settings/Menu once built (Phase 2/6). Only call this after
 * confirming via hasRestaurant() that the user chose "start fresh" over pairing with an
 * existing cloud restaurant (see src/features/setup/setupService.ts).
 */
export async function createLocalRestaurant(): Promise<void> {
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
