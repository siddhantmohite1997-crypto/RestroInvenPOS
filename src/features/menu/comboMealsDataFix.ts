import AsyncStorage from '@react-native-async-storage/async-storage';
import { listCategories, deleteCategory } from './categoryService';
import { listItems, deleteItem } from './itemService';
import { createCombo } from './comboService';

/**
 * One-time, targeted data correction -- not a general app feature.
 *
 * Quality Bites' original bulk-imported menu modeled fixed-price bundle deals (e.g. "Chicken
 * Schezwan Pizza + Mocktail") as ordinary menu items under a "Combo Meals" category, rather than
 * as real Combo Deals. That was corrected directly in Supabase once, but the fix didn't stick:
 * every device's local SQLite still had the old category and items, so the next sync push
 * (local -> cloud, this app never pulls incremental updates back down) silently recreated them
 * in the cloud right alongside the new Combo Deals, duplicating the data.
 *
 * A server-only fix can never survive a client that still disagrees, so this applies the exact
 * same correction on-device: turn each "Combo Meals" item into a real Combo Deal, then soft-delete
 * the original item and category. Once local and cloud agree, the normal sync path (which only
 * pushes real changes) keeps them that way. Guarded to run at most once per restaurant per device.
 */
function migrationDoneKey(restaurantId: string) {
  return `pos:migrations:comboMealsFix:${restaurantId}`;
}

export async function runComboMealsDataFix(restaurantId: string): Promise<void> {
  const alreadyDone = await AsyncStorage.getItem(migrationDoneKey(restaurantId));
  if (alreadyDone) return;

  const categories = await listCategories(restaurantId);
  const comboMealsCategory = categories.find((c) => c.name === 'Combo Meals');

  if (comboMealsCategory) {
    const items = await listItems(restaurantId, comboMealsCategory.id);
    for (const item of items) {
      await createCombo({
        restaurantId,
        name: item.name,
        price: item.price,
        items: [],
      });
      await deleteItem(item.id);
    }
    await deleteCategory(comboMealsCategory.id);
  }

  await AsyncStorage.setItem(migrationDoneKey(restaurantId), 'true');
}
