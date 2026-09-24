import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '@/store/authStore';
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

  useEffect(() => {
    if (!currentUser || !restaurant || !currentPin) return;

    const restaurantId = restaurant.id;
    const pin = currentPin;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (appStateRef.current !== 'active') return;
      // Silent on failure by design (no Alert here, see hook doc comment above). Deliberately
      // NOT calling logSyncAttempt here: syncNow already logs the attempt internally before
      // rethrowing (same pattern as useSyncGate's catch block), so logging again here would
      // double-write a syncLogs row for every single failure. Keep this catch empty.
      syncNow(restaurantId, pin, 'auto').catch(() => {});
    };

    intervalId = setInterval(tick, PERIODIC_SYNC_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, [currentUser, restaurant, currentPin]);
}
