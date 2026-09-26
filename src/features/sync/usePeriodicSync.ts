import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { flushPendingInventoryDeltas } from '@/features/inventory/stockAdjustmentService';
import { syncNow } from './syncService';

const PERIODIC_SYNC_INTERVAL_MS = 120_000;

/** Runs a combined push+pull sync every 2 minutes while the app is in the foreground and a
 * restaurant/PIN is active -- this is what makes another device's changes (a bill someone else
 * just punched, a stock delta someone else's device queued while offline) show up here without
 * anyone tapping "Sync Now". Pauses entirely while backgrounded, matching normal mobile
 * battery/data hygiene -- no point polling a screen nobody's looking at. Silent on failure
 * (no alert popups every 2 minutes on a bad connection); failures are still recorded via
 * logSyncAttempt, same as every other sync path, so Settings > Sync's history still shows them. */
export function usePeriodicSync() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurant = useAuthStore((s) => s.restaurant);
  const currentPin = useAuthStore((s) => s.currentPin);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  /** Guards against a tick that outlives its own interval overlapping the next one -- two
   * concurrent db.transaction calls on the same SQLite connection. Realistic whenever a pull is
   * large (a device's first pull after upgrading, say), and cheap to prevent. */
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!currentUser || !restaurant || !currentPin) return;

    const restaurantId = restaurant.id;
    const pin = currentPin;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (appStateRef.current !== 'active' || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // Flush FIRST, then sync -- sequentially, never racing. The pull half of syncNow adopts
        // the server's quantity for every inventory item unconditionally, so if it lands before
        // this device's queued deltas reach the server, it adopts a value the server is about to
        // change and the till visibly reverts to a stale number until the next cycle corrects
        // it. Delivering the deltas first makes the server's data current before anything is
        // pulled from it, so the pull gets the right value on its first attempt.
        //
        // Both catches are silent by design (no Alert here, see the hook doc comment above).
        // Individual delta failures are already handled -- left queued -- inside
        // flushPendingInventoryDeltas itself. And deliberately NO logSyncAttempt around syncNow:
        // it already logs the attempt internally before rethrowing (same pattern as useSyncGate's
        // catch block), so logging again here would double-write a syncLogs row for every single
        // failure. Keep both catches empty.
        await flushPendingInventoryDeltas(restaurantId, pin).catch(() => {});
        await syncNow(restaurantId, pin, 'auto').catch(() => {});
      } finally {
        inFlightRef.current = false;
      }
    };

    // tick is async now but can never reject (both awaits are caught, the finally can't throw),
    // so firing it without awaiting is safe -- `void` just makes that explicit.
    intervalId = setInterval(() => void tick(), PERIODIC_SYNC_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, [currentUser, restaurant, currentPin]);
}
