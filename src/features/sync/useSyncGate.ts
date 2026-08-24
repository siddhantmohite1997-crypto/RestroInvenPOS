import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { getAutoSyncTime, getLastAutoSyncDate, getLastSyncedAt, getSyncMode, setLastAutoSyncDate } from './syncConfig';
import { syncNow } from './syncService';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Runs once per login: in manual mode, reminds the user if it's been over 2 days since
 * the last successful sync; in auto mode, fires today's scheduled sync if it hasn't run
 * yet and the scheduled time has passed. This is the "check on app open" pattern — there's
 * no reliable way to run code at an exact time while the app is fully closed on iOS/Android
 * without a native background-task module, so auto-sync only actually happens on days the
 * app gets opened after the scheduled time.
 */
export function useSyncGate() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurant = useAuthStore((s) => s.restaurant);
  const currentPin = useAuthStore((s) => s.currentPin);
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!currentUser || !restaurant || !currentPin) {
      hasRunRef.current = false;
      return;
    }
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const restaurantId = restaurant.id;

    (async () => {
      const mode = await getSyncMode(restaurantId);

      if (mode === 'manual') {
        const lastSyncedAt = await getLastSyncedAt(restaurantId);
        if (!lastSyncedAt || Date.now() - lastSyncedAt.getTime() > TWO_DAYS_MS) {
          Alert.alert(
            'Sync reminder',
            "This restaurant's data hasn't been backed up to the cloud in over 2 days. Go to Settings → Sync to sync now.",
          );
        }
        return;
      }

      // mode === 'auto'
      const today = new Date().toISOString().slice(0, 10);
      const lastAutoSyncDate = await getLastAutoSyncDate(restaurantId);
      if (lastAutoSyncDate === today) return;

      const autoSyncTime = await getAutoSyncTime(restaurantId);
      const [hh, mm] = autoSyncTime.split(':').map(Number);
      const scheduled = new Date();
      scheduled.setHours(hh, mm, 0, 0);
      if (new Date() < scheduled) return;

      try {
        await syncNow(restaurantId, currentPin, 'auto');
      } catch (err) {
        Alert.alert(
          'Auto sync failed',
          err instanceof Error ? err.message : 'Could not sync automatically. You can sync manually from Settings.',
        );
      } finally {
        // Mark today as attempted even on failure — otherwise a disabled/unreachable
        // restaurant would re-prompt every time the app is opened, all day.
        await setLastAutoSyncDate(restaurantId, today);
      }
    })();
  }, [currentUser, restaurant, currentPin]);
}
