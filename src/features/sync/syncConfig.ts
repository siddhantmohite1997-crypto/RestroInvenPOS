import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncMode = 'manual' | 'auto';

function lastSyncedKey(restaurantId: string) {
  return `pos:sync:lastSyncedAt:${restaurantId}`;
}

function syncModeKey(restaurantId: string) {
  return `pos:sync:mode:${restaurantId}`;
}

function autoSyncTimeKey(restaurantId: string) {
  return `pos:sync:autoSyncTime:${restaurantId}`;
}

function lastAutoSyncDateKey(restaurantId: string) {
  return `pos:sync:lastAutoSyncDate:${restaurantId}`;
}

export async function getLastSyncedAt(restaurantId: string): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(lastSyncedKey(restaurantId));
  return raw ? new Date(Number(raw)) : null;
}

export async function setLastSyncedAt(restaurantId: string, when: Date): Promise<void> {
  await AsyncStorage.setItem(lastSyncedKey(restaurantId), String(when.getTime()));
}

export async function getSyncMode(restaurantId: string): Promise<SyncMode> {
  const raw = await AsyncStorage.getItem(syncModeKey(restaurantId));
  return raw === 'auto' ? 'auto' : 'manual';
}

export async function setSyncMode(restaurantId: string, mode: SyncMode): Promise<void> {
  await AsyncStorage.setItem(syncModeKey(restaurantId), mode);
}

/** 24h "HH:MM" string, e.g. "09:30". Defaults to 09:00 if never set. */
export async function getAutoSyncTime(restaurantId: string): Promise<string> {
  const raw = await AsyncStorage.getItem(autoSyncTimeKey(restaurantId));
  return raw ?? '09:00';
}

export async function setAutoSyncTime(restaurantId: string, time: string): Promise<void> {
  await AsyncStorage.setItem(autoSyncTimeKey(restaurantId), time);
}

/** "YYYY-MM-DD" of the last date auto-sync actually ran — prevents firing more than
 * once per day when the app is opened multiple times after the scheduled time. */
export async function getLastAutoSyncDate(restaurantId: string): Promise<string | null> {
  return AsyncStorage.getItem(lastAutoSyncDateKey(restaurantId));
}

export async function setLastAutoSyncDate(restaurantId: string, date: string): Promise<void> {
  await AsyncStorage.setItem(lastAutoSyncDateKey(restaurantId), date);
}
