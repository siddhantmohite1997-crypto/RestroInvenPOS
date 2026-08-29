import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { inventoryItems, recipeIngredients } from '@/db/schema';
import { generateId } from '@/lib/id';

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;

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

/** Soft delete: recipe_ingredients references inventoryItemId. */
export async function deleteInventoryItem(id: string): Promise<void> {
  await db.update(inventoryItems).set({ isActive: false, updatedAt: new Date() }).where(eq(inventoryItems.id, id));
}

export interface RecipeIngredientWithItem extends RecipeIngredient {
  inventoryItem: InventoryItem;
}

export async function getRecipeIngredients(menuItemId: string): Promise<RecipeIngredientWithItem[]> {
  const rows = await db.query.recipeIngredients.findMany({
    where: (r, { eq: eqOp }) => eqOp(r.menuItemId, menuItemId),
  });
  const withItems = await Promise.all(
    rows.map(async (r) => {
      const inventoryItem = await getInventoryItem(r.inventoryItemId);
      return inventoryItem ? { ...r, inventoryItem } : null;
    }),
  );
  return withItems.filter((r): r is RecipeIngredientWithItem => r !== null);
}

/** Replace-all: the linking screen saves its whole ingredient list at once rather than
 * attaching/detaching one row at a time. */
export async function setRecipeIngredients(
  menuItemId: string,
  rows: { inventoryItemId: string; quantityRequired: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(recipeIngredients).where(eq(recipeIngredients.menuItemId, menuItemId));
    for (const row of rows) {
      await tx.insert(recipeIngredients).values({
        id: generateId(),
        menuItemId,
        inventoryItemId: row.inventoryItemId,
        quantityRequired: row.quantityRequired,
      });
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
      where: (r, { eq: eqOp }) => eqOp(r.menuItemId, item.id),
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
    where: (r, { eq: eqOp }) => eqOp(r.menuItemId, menuItemId),
  });
  for (const row of rows) {
    await db
      .update(inventoryItems)
      .set({
        quantity: sql`${inventoryItems.quantity} - ${row.quantityRequired * quantityDelta}`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, row.inventoryItemId));
  }
}

/** Inverse of consumeIngredients — restores quantityDelta servings' worth of ingredients. */
export async function restoreIngredients(menuItemId: string | null | undefined, quantityDelta: number): Promise<void> {
  await consumeIngredients(menuItemId, -quantityDelta);
}
