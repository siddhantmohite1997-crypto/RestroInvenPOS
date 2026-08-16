import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

/**
 * PIN authentication result
 */
export interface AuthResult {
  valid: boolean;
  reason?: string;
}

/**
 * Sync result with table-level counts
 */
export interface SyncResult {
  pushedCounts: Record<string, number>;
}

/**
 * Verify PIN against staff records and check if restaurant is enabled
 */
export async function verifyPinAuth(restaurantId: string, pin: string): Promise<AuthResult> {
  // Check if restaurant is enabled
  const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
  if (!restaurantDoc.exists) {
    return { valid: false, reason: 'Restaurant not found' };
  }

  const restaurant = restaurantDoc.data() as any;
  if (restaurant?.enabled === false) {
    return { valid: false, reason: 'Restaurant is currently disabled' };
  }

  // Check PIN against staff records
  // PIN is stored as SHA-256 hash in the app
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

  const staffDocs = await db.collection(`restaurants/${restaurantId}/staff`).where('pinHash', '==', pinHash).limit(1).get();

  if (staffDocs.empty) {
    return { valid: false, reason: 'Invalid PIN' };
  }

  return { valid: true };
}

/**
 * Sync local database changes to multi-tenant Firestore
 * Data structure:
 *   restaurants/{restaurantId}/{collection}/{docId}
 */
export async function syncRestaurantData(restaurantId: string, syncData: Record<string, unknown>): Promise<SyncResult> {
  const pushedCounts: Record<string, number> = {};

  // Tables to sync (excluding sensitive data like PINs)
  const tables = [
    'restaurants',
    'categories',
    'menuItems',
    'modifierGroups',
    'modifiers',
    'menuItemModifierGroups',
    'taxRules',
    'comboDeals',
    'comboDealItems',
    'diningTables',
    'orders',
    'orderItems',
    'orderItemModifiers',
    'discounts',
    'payments',
    'auditLogs',
  ];

  for (const table of tables) {
    const rows = (syncData[table] as any[]) || [];
    pushedCounts[table] = 0;

    for (const row of rows) {
      // Don't sync staff PINs to Firestore (already stored at setup)
      if (table === 'staff') {
        continue;
      }

      const { changedAt: _changedAt, ...cleanRow } = row as any;

      // Write to multi-tenant path
      const docRef = db.collection(`restaurants/${restaurantId}/${table}`).doc((row as any).id);
      await docRef.set(cleanRow, { merge: true });
      pushedCounts[table]++;
    }
  }

  // Update last synced timestamp
  await db.collection('restaurants').doc(restaurantId).update({
    lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { pushedCounts };
}

/**
 * Enable a restaurant (admin function)
 */
export async function enableRestaurant(restaurantId: string): Promise<void> {
  await db.collection('restaurants').doc(restaurantId).update({
    enabled: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Disable a restaurant (admin function)
 */
export async function disableRestaurant(restaurantId: string, reason?: string): Promise<void> {
  await db.collection('restaurants').doc(restaurantId).update({
    enabled: false,
    disabledReason: reason || 'Disabled by admin',
    disabledAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get restaurant status (admin function)
 */
export async function getRestaurantStatus(
  restaurantId: string,
): Promise<{
  id: string;
  name: string;
  enabled: boolean;
  lastSyncedAt?: string;
  disabledReason?: string;
}> {
  const doc = await db.collection('restaurants').doc(restaurantId).get();

  if (!doc.exists) {
    throw new Error(`Restaurant ${restaurantId} not found`);
  }

  const data = doc.data() as any;
  return {
    id: restaurantId,
    name: data.name || 'Unknown',
    enabled: data.enabled !== false,
    lastSyncedAt: data.lastSyncedAt?.toDate?.()?.toISOString(),
    disabledReason: data.disabledReason,
  };
}
