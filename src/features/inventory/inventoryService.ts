import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { inventoryItems, recipeIngredients } from '@/db/schema';
import { generateId } from '@/lib/id';

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;

/** Display-time defense-in-depth against floating-point artifacts (e.g. 9.400000000000002)
 * in the quantity — consumeIngredients rounds at write time, but this covers any row written
 * before that fix, or through any other path (manual edit, sync from an older client). */
export function formatQuantity(quantity: number): string {
  return String(Math.round((quantity + Number.EPSILON) * 1000) / 1000);
}

export async function listInventoryItems(restaurantId: string): Promise<InventoryItem[]> {
  return db.query.inventoryItems.findMany({
    where: (i, { and, eq: eqOp }) => and(eqOp(i.restaurantId, restaurantId), eqOp(i.isActive, true)),
    orderBy: (i, { asc }) => asc(i.name),
  });
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const row = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, id) });
  return row ?? null;
}

export interface InventoryItemInput {
  restaurantId: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold?: number;
  costPerUnit?: number;
}

export async function createInventoryItem(input: InventoryItemInput): Promise<string> {
  const id = generateId();
  await db.insert(inventoryItems).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    unit: input.unit,
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    costPerUnit: input.costPerUnit,
  });
  return id;
}

export async function updateInventoryItem(id: string, input: Partial<InventoryItemInput>): Promise<void> {
  await db
    .update(inventoryItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id));
}

/** Soft delete. Also soft-deletes any recipe_ingredients rows pointing at this item -- unlike
 * other soft-deletes in this app, leaving them active behind wouldn't just show stale data, it
 * would let a dish keep silently deducting quantity from an item the user can no longer see or
 * manage. A hard delete here would never propagate to Supabase (sync only ever pushes upserts),
 * leaving an orphaned row there forever -- soft delete is what a delete actually looks like in
 * this app's push-only sync model. */
export async function deleteInventoryItem(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(inventoryItems).set({ isActive: false, updatedAt: new Date() }).where(eq(inventoryItems.id, id));
    await tx
      .update(recipeIngredients)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(recipeIngredients.inventoryItemId, id));
  });
}

export interface RecipeIngredientWithItem extends RecipeIngredient {
  inventoryItem: InventoryItem;
}

export async function getRecipeIngredients(menuItemId: string): Promise<RecipeIngredientWithItem[]> {
  const rows = await db.query.recipeIngredients.findMany({
    where: (r, { and, eq: eqOp }) => and(eqOp(r.menuItemId, menuItemId), eqOp(r.isActive, true)),
  });
  const withItems = await Promise.all(
    rows.map(async (r) => {
      const inventoryItem = await getInventoryItem(r.inventoryItemId);
      return inventoryItem ? { ...r, inventoryItem } : null;
    }),
  );
  return withItems.filter((r): r is RecipeIngredientWithItem => r !== null);
}

/** Replace-all, but as an upsert-by-inventoryItemId rather than delete-all-then-reinsert: a row
 * for an ingredient still present keeps its id and just gets its quantity updated, a newly added
 * ingredient gets a fresh row, and a removed ingredient is soft-deleted (isActive=false) rather
 * than hard-deleted. Hard-deleting and reinserting with new ids -- the previous approach -- left
 * every prior save's rows orphaned in Supabase forever, since this app's sync only ever pushes
 * upserts keyed by id and never propagates a local hard delete. */
export async function setRecipeIngredients(
  menuItemId: string,
  rows: { inventoryItemId: string; quantityRequired: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.query.recipeIngredients.findMany({
      where: (r, { eq: eqOp }) => eqOp(r.menuItemId, menuItemId),
    });
    const existingByItem = new Map(existing.map((r) => [r.inventoryItemId, r]));
    const incomingItemIds = new Set(rows.map((r) => r.inventoryItemId));

    for (const row of rows) {
      const match = existingByItem.get(row.inventoryItemId);
      if (match) {
        await tx
          .update(recipeIngredients)
          .set({ quantityRequired: row.quantityRequired, isActive: true, updatedAt: new Date() })
          .where(eq(recipeIngredients.id, match.id));
      } else {
        await tx.insert(recipeIngredients).values({
          id: generateId(),
          menuItemId,
          inventoryItemId: row.inventoryItemId,
          quantityRequired: row.quantityRequired,
        });
      }
    }

    for (const old of existing) {
      if (!incomingItemIds.has(old.inventoryItemId) && old.isActive) {
        await tx
          .update(recipeIngredients)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(recipeIngredients.id, old.id));
      }
    }
  });
}

/** How many recipe_ingredients rows exist per menu item — used by the Recipes list to show a
 * "Not linked" vs "N ingredients" badge without fetching every row for every item. */
export async function countIngredientsByMenuItem(restaurantId: string): Promise<Record<string, number>> {
  const rows = await db.query.menuItems.findMany({
    where: (m, { and, eq: eqOp }) => and(eqOp(m.restaurantId, restaurantId), eqOp(m.isActive, true)),
    columns: { id: true },
  });
  const counts: Record<string, number> = {};
  for (const item of rows) {
    const linked = await db.query.recipeIngredients.findMany({
      where: (r, { and, eq: eqOp }) => and(eqOp(r.menuItemId, item.id), eqOp(r.isActive, true)),
      columns: { id: true },
    });
    counts[item.id] = linked.length;
  }
  return counts;
}

/** Applies quantityDelta servings of menuItemId's recipe to inventory: subtracts
 * quantityRequired * quantityDelta from each linked ingredient. No-op for an unlinked menu
 * item (or one with no menuItemId, e.g. a combo). Never blocks on insufficient stock — a
 * negative resulting quantity is the low-stock signal itself, not an error to suppress. */
export async function consumeIngredients(menuItemId: string | null | undefined, quantityDelta: number): Promise<void> {
  if (!menuItemId || quantityDelta === 0) return;
  const rows = await db.query.recipeIngredients.findMany({
    where: (r, { and, eq: eqOp }) => and(eqOp(r.menuItemId, menuItemId), eqOp(r.isActive, true)),
  });
  for (const row of rows) {
    // Rounded to 3dp (matching the NUMERIC(10,3) column in Supabase) at write time, not just
    // on display — floating-point subtraction alone leaves artifacts like 9.400000000000002
    // that would otherwise accumulate further with every subsequent order.
    await db
      .update(inventoryItems)
      .set({
        quantity: sql`ROUND(${inventoryItems.quantity} - ${row.quantityRequired * quantityDelta}, 3)`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, row.inventoryItemId));
  }
}

/** Inverse of consumeIngredients — restores quantityDelta servings' worth of ingredients. */
export async function restoreIngredients(menuItemId: string | null | undefined, quantityDelta: number): Promise<void> {
  await consumeIngredients(menuItemId, -quantityDelta);
}
