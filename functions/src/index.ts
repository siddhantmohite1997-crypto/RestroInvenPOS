import { setGlobalOptions } from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyPinAuth, syncRestaurantData, enableRestaurant, disableRestaurant, getRestaurantStatus } from './sync';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Set global options
setGlobalOptions({ maxInstances: 10 });

// ============================================================================
// PUBLIC API: Called by mobile app
// ============================================================================

/**
 * Multi-tenant sync endpoint
 * Called by mobile app with restaurantId + PIN for authentication
 * Receives local DB changes, validates auth, writes to multi-tenant Firestore
 */
export const syncRestaurant = onCall(async (request) => {
  try {
    const data = request.data as {
      restaurantId: string;
      pin: string;
      syncData: Record<string, unknown>;
    };
    const { restaurantId, pin, syncData } = data;

    if (!restaurantId || !pin) {
      throw new Error('restaurantId and pin required');
    }

    // Verify restaurant is enabled and PIN is correct
    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      throw new Error(auth.reason || 'Authentication failed');
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
    throw new Error(String(err));
  }
});

// ============================================================================
// ADMIN API: Called by admin dashboard (requires Firebase admin auth)
// ============================================================================

/**
 * Enable a restaurant (admin only)
 */
export const adminEnableRestaurant = onCall(async (request) => {
  // Verify caller is authenticated as admin (via Firebase custom claims)
  if (!request.auth || request.auth.token.admin !== true) {
    throw new Error('Admin access required');
  }

  const data = request.data as { restaurantId: string };
  const { restaurantId } = data;
  if (!restaurantId) {
    throw new Error('restaurantId required');
  }

  await enableRestaurant(restaurantId);
  return { success: true, message: `Restaurant ${restaurantId} enabled` };
});

/**
 * Disable a restaurant (admin only)
 */
export const adminDisableRestaurant = onCall(async (request) => {
  // Verify caller is authenticated as admin
  if (!request.auth || request.auth.token.admin !== true) {
    throw new Error('Admin access required');
  }

  const data = request.data as { restaurantId: string; reason?: string };
  const { restaurantId, reason } = data;
  if (!restaurantId) {
    throw new Error('restaurantId required');
  }

  await disableRestaurant(restaurantId, reason);
  return { success: true, message: `Restaurant ${restaurantId} disabled` };
});

/**
 * Get restaurant status (admin only)
 */
export const adminGetRestaurantStatus = onCall(async (request) => {
  // Verify caller is authenticated as admin
  if (!request.auth || request.auth.token.admin !== true) {
    throw new Error('Admin access required');
  }

  const data = request.data as { restaurantId: string };
  const { restaurantId } = data;
  if (!restaurantId) {
    throw new Error('restaurantId required');
  }

  const status = await getRestaurantStatus(restaurantId);
  return status;
});
