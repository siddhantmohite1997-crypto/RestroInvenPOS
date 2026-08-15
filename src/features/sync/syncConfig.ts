import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FirebaseConfig {
  apiKey: string;
  projectId: string;
  appId: string;
}

function configKey(restaurantId: string) {
  return `pos:sync:firebaseConfig:${restaurantId}`;
}

function lastSyncedKey(restaurantId: string) {
  return `pos:sync:lastSyncedAt:${restaurantId}`;
}

export async function getFirebaseConfig(restaurantId: string): Promise<FirebaseConfig | null> {
  const raw = await AsyncStorage.getItem(configKey(restaurantId));
  return raw ? (JSON.parse(raw) as FirebaseConfig) : null;
}

export async function setFirebaseConfig(restaurantId: string, config: FirebaseConfig): Promise<void> {
  await AsyncStorage.setItem(configKey(restaurantId), JSON.stringify(config));
}

export async function clearFirebaseConfig(restaurantId: string): Promise<void> {
  await AsyncStorage.removeItem(configKey(restaurantId));
}

export async function getLastSyncedAt(restaurantId: string): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(lastSyncedKey(restaurantId));
  return raw ? new Date(Number(raw)) : null;
}

export async function setLastSyncedAt(restaurantId: string, when: Date): Promise<void> {
  await AsyncStorage.setItem(lastSyncedKey(restaurantId), String(when.getTime()));
}
