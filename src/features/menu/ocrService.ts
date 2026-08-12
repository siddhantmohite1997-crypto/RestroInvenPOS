import Constants from 'expo-constants';

export interface ExtractedMenuItem {
  name: string;
  price: number;
  guessedCategoryName?: string;
}

/**
 * ASSUMPTION flagged for review: menu-photo OCR needs a vision model call (Claude/Google
 * Vision), and that call must NOT happen directly from the phone — embedding a cloud AI API
 * key in a shipped APK means anyone can extract and abuse it. This function instead posts the
 * photo to a backend endpoint you control (e.g. a Firebase Cloud Function that holds the real
 * key server-side), configured via `expo.extra.ocrEndpointUrl` in app.json.
 *
 * Until that endpoint exists, this throws a clear error rather than silently no-op'ing or
 * faking results — the review screen surfaces the message so it's obvious setup is needed,
 * per the "don't auto-commit OCR results without review" requirement (nothing to review yet).
 */
export async function extractMenuItemsFromImage(imageUri: string): Promise<ExtractedMenuItem[]> {
  const endpoint = Constants.expoConfig?.extra?.ocrEndpointUrl as string | undefined;
  if (!endpoint) {
    throw new Error(
      'Menu scanning needs a backend OCR endpoint. Set expo.extra.ocrEndpointUrl in app.json to a ' +
        'server endpoint that forwards the photo to a vision API — see README.',
    );
  }

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'menu.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  const response = await fetch(endpoint, { method: 'POST', body: formData });
  if (!response.ok) {
    throw new Error(`OCR request failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { items: ExtractedMenuItem[] };
  return data.items;
}
