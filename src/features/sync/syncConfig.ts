import AsyncStorage from '@react-native-async-storage/async-storage';

function lastSyncedKey(restaurantId: string) {
  return `pos:sync:lastSyncedAt:${restaurantId}`;
}

export async function getLastSyncedAt(restaurantId: string): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(lastSyncedKey(restaurantId));
  return raw ? new Date(Number(raw)) : null;
}

export async function setLastSyncedAt(restaurantId: string, when: Date): Promise<void> {
  await AsyncStorage.setItem(lastSyncedKey(restaurantId), String(when.getTime()));
}
