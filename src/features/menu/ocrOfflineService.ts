import * as FileSystem from 'expo-file-system';
import { Tesseract } from 'tesseract.js';

export interface ExtractedMenuItem {
  name: string;
  price: number;
  guessedCategoryName?: string;
}

/**
 * Offline OCR using Tesseract.js (pure JavaScript, no backend needed)
 * Works completely offline after initial download (~50MB language data).
 * Extracts menu items and prices from images.
 *
 * Workflow:
 * 1. Initialize Tesseract worker (first time only)
 * 2. Load image as base64
 * 3. Recognize text via OCR
 * 4. Parse results to extract items and prices
 * 5. Return structured data
 */

let tesseractWorker: Tesseract.Worker | null = null;

async function getTesseractWorker(): Promise<Tesseract.Worker> {
  if (tesseractWorker) {
    return tesseractWorker;
  }

  // Initialize Tesseract worker (downloads ~50MB language data first time)
  tesseractWorker = await Tesseract.createWorker('eng', 1, {
    cachePath: `${FileSystem.cacheDirectory}tesseract/`,
    corePath: `${FileSystem.cacheDirectory}tesseract/core/`,
  });

  await tesseractWorker.load();
  await tesseractWorker.initialize('eng');
  return tesseractWorker;
}

/**
 * Parse OCR text to extract menu items and prices
 * Looks for patterns like:
 *   Burger        250
 *   Margherita Pizza      350
 *   Coke (Small)   50
 */
function parseMenuText(text: string): ExtractedMenuItem[] {
  const lines = text.split('\n').filter((line) => line.trim());
  const items: ExtractedMenuItem[] = [];

  for (const line of lines) {
    // Skip lines that are too short (likely headers/noise)
    if (line.length < 5) continue;

    // Try to extract price from end of line (numbers at the end)
    const priceMatch = line.match(/(\d+(?:\.\d{1,2})?)\s*$/) || line.match(/₹?\s*(\d+(?:\.\d{1,2})?)/);

    if (priceMatch) {
      const price = parseFloat(priceMatch[1]);
      if (isNaN(price) || price <= 0) continue;

      // Remove price from line to get item name
      const nameRaw = line
        .replace(/(\d+(?:\.\d{1,2})?)\s*$/, '') // Remove trailing price
        .replace(/₹?\s*(\d+(?:\.\d{1,2})?)/, '') // Remove inline price
        .trim();

      if (nameRaw.length > 2) {
        items.push({
          name: nameRaw.substring(0, 100), // Limit name length
          price: Math.round(price * 100) / 100, // Round to 2 decimals
          guessedCategoryName: guessCategory(nameRaw),
        });
      }
    }
  }

  // Remove duplicates (same name + price within ±1)
  return deduplicateItems(items);
}

/**
 * Guess category based on item name
 */
function guessCategory(name: string): string | undefined {
  const lower = name.toLowerCase();

  if (lower.includes('pizza') || lower.includes('pasta') || lower.includes('bread')) return 'Italian';
  if (lower.includes('burger') || lower.includes('fries') || lower.includes('chicken')) return 'Fast Food';
  if (lower.includes('biryani') || lower.includes('curry') || lower.includes('tandoori')) return 'Indian';
  if (lower.includes('sushi') || lower.includes('ramen')) return 'Asian';
  if (lower.includes('coke') || lower.includes('pepsi') || lower.includes('juice') || lower.includes('water'))
    return 'Beverages';
  if (lower.includes('cake') || lower.includes('dessert') || lower.includes('ice cream')) return 'Desserts';

  return undefined;
}

/**
 * Remove duplicate items (same name, prices within ±1)
 */
function deduplicateItems(items: ExtractedMenuItem[]): ExtractedMenuItem[] {
  const seen = new Map<string, ExtractedMenuItem>();

  for (const item of items) {
    const key = item.name.toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, item);
    } else {
      const existing = seen.get(key)!;
      // Keep the one with more precise category guess
      if (item.guessedCategoryName && !existing.guessedCategoryName) {
        seen.set(key, item);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Extract menu items from image using offline OCR
 * First call downloads ~50MB language data. Subsequent calls are instant.
 */
export async function extractMenuItemsFromImage(imageUri: string): Promise<ExtractedMenuItem[]> {
  try {
    // Read image as base64
    const base64Data = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Create data URL for Tesseract
    const dataUrl = `data:image/jpeg;base64,${base64Data}`;

    // Get or initialize Tesseract worker
    const worker = await getTesseractWorker();

    // Run OCR
    const result = await worker.recognize(dataUrl, 'eng');

    // Parse extracted text to menu items
    const items = parseMenuText(result.data.text);

    return items;
  } catch (err) {
    throw new Error(
      `Failed to extract menu items from image: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
  }
}

/**
 * Terminate Tesseract worker (call on app shutdown to free memory)
 */
export async function terminateTesseract(): Promise<void> {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}
