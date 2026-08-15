import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { FirebaseConfig } from './syncConfig';

let cachedApp: FirebaseApp | null = null;
let cachedConfigKey: string | null = null;

/**
 * Firestore-only client — no Firebase Auth. The modular Firebase JS SDK talks to Firestore over
 * plain HTTPS/WebSocket, so this works in Expo Go without any native module (Firebase Auth's
 * persistence layer is the part that needs native/AsyncStorage wiring; we don't use it).
 */
export async function getFirestoreClient(config: FirebaseConfig): Promise<Firestore> {
  const key = `${config.projectId}:${config.appId}`;
  if (cachedApp && cachedConfigKey === key) {
    return getFirestore(cachedApp);
  }

  for (const app of getApps()) {
    await deleteApp(app);
  }

  cachedApp = initializeApp({
    apiKey: config.apiKey,
    projectId: config.projectId,
    appId: config.appId,
  });
  cachedConfigKey = key;

  return getFirestore(cachedApp);
}
