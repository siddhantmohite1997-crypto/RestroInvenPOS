import Constants from 'expo-constants';
import { extractMenuItemsFromImage as extractOffline } from './ocrOfflineService';

export interface ExtractedMenuItem {
  name: string;
  price: number;
  guessedCategoryName?: string;
}

/**
 * Menu OCR service (supports both offline and backend options)
 *
 * Offline (Tesseract.js):
 *   - No backend required, works completely locally
 *   - First use downloads ~50MB language data
 *   - All subsequent uses are instant
 *   - Works on any device
 *
 * Backend (Cloud Function + Vision API):
 *   - Requires backend setup
 *   - More accurate (uses Google Vision or Claude)
 *   - API key kept server-side (secure)
 *   - Requires internet connection
 */
export async function extractMenuItemsFromImage(imageUri: string): Promise<ExtractedMenuItem[]> {
  const backendEndpoint = Constants.expoConfig?.extra?.ocrEndpointUrl as string | undefined;

  // Prefer backend if configured, fall back to offline
  if (backendEndpoint) {
    try {
      return await extractFromBackend(backendEndpoint, imageUri);
    } catch (err) {
      console.warn('Backend OCR failed, falling back to offline:', err);
      // Fall through to offline OCR
    }
  }

  // Use offline OCR
  return extractOffline(imageUri);
}

/**
 * Extract via backend Cloud Function
 */
async function extractFromBackend(endpoint: string, imageUri: string): Promise<ExtractedMenuItem[]> {
  const { readAsStringAsync, EncodingType } = await import('expo-file-system');

  // Read image as base64
  const base64Data = await readAsStringAsync(imageUri, {
    encoding: EncodingType.Base64,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Data,
      mimeType: 'image/jpeg',
    }),
  });

  if (!response.ok) {
    throw new Error(`OCR request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { items: ExtractedMenuItem[] };
  return data.items;
}
