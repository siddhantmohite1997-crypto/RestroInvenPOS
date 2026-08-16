import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { verifyPinAuth, syncRestaurantData, enableRestaurant, disableRestaurant, getRestaurantStatus } from './sync';

// Initialize Firebase Admin SDK
admin.initializeApp();

// ============================================================================
// PUBLIC API: Called by mobile app
// ============================================================================

/**
 * Multi-tenant sync endpoint
 * Called by mobile app with restaurantId + PIN for authentication
 * Receives local DB changes, validates auth, writes to multi-tenant Firestore
 */
export const syncRestaurant = functions.https.onCall(async (data, context) => {
  try {
    const { restaurantId, pin, syncData } = data as {
      restaurantId: string;
      pin: string;
      syncData: Record<string, unknown>;
    };

    if (!restaurantId || !pin) {
      throw new functions.https.HttpsError('invalid-argument', 'restaurantId and pin required');
    }

    // Verify restaurant is enabled and PIN is correct
    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      throw new functions.https.HttpsError('permission-denied', auth.reason || 'Authentication failed');
    }

    // Sync data to multi-tenant Firestore
    const result = await syncRestaurantData(restaurantId, syncData);

    return {
      success: true,
      syncedAt: new Date().toISOString(),
      pushedCounts: result.pushedCounts,
    };
  } catch (err) {
    console.error('Sync error:', err);
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    throw new functions.https.HttpsError('internal', String(err));
  }
});

// ============================================================================
// ADMIN API: Called by admin dashboard (requires Firebase admin auth)
// ============================================================================

/**
 * Enable a restaurant (admin only)
 */
export const adminEnableRestaurant = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated as admin (via Firebase custom claims)
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { restaurantId } = data as { restaurantId: string };
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'restaurantId required');
  }

  await enableRestaurant(restaurantId);
  return { success: true, message: `Restaurant ${restaurantId} enabled` };
});

/**
 * Disable a restaurant (admin only)
 */
export const adminDisableRestaurant = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated as admin
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { restaurantId, reason } = data as { restaurantId: string; reason?: string };
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'restaurantId required');
  }

  await disableRestaurant(restaurantId, reason);
  return { success: true, message: `Restaurant ${restaurantId} disabled` };
});

/**
 * Get restaurant status (admin only)
 */
export const adminGetRestaurantStatus = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated as admin
  if (!context.auth || context.auth.token.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }

  const { restaurantId } = data as { restaurantId: string };
  if (!restaurantId) {
    throw new functions.https.HttpsError('invalid-argument', 'restaurantId required');
  }

  const status = await getRestaurantStatus(restaurantId);
  return status;
});
