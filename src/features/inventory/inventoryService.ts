import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { inventoryItems, inventoryPurchases, recipeIngredients } from '@/db/schema';
import { generateId } from '@/lib/id';
import { round2 } from '@/features/tax/taxEngine';

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type RecipeIngredient = typeof recipeIngredients.$inferSelect;
export type InventoryPurchase = typeof inventoryPurchases.$inferSelect;

/** Display-time defense-in-depth against floating-point artifacts (e.g. 9.400000000000002)
 * in the quantity — consumeIngredients rounds at write time, but this covers any row written
 * before that fix, or through any other path (manual edit, sync from an older client). */
export function formatQuantity(quantity: number): string {
  return String(Math.round((quantity + Number.EPSILON) * 1000) / 1000);
}

/** Nobody thinks of a per-serving recipe amount as "0.150 kg" or "0.030 l" -- they think "150 g"
 * or "30 ml". Recipe entry converts to/from this finer unit for kg/l stock items; anything else
 * (pcs, box, packet, ...) has no natural finer subunit, so it's entered directly, factor 1. The
 * inventory item's own stock quantity is never touched by this -- it stays in its stored unit. */
export function getRecipeInputUnit(stockUnit: string): { label: string; factor: number } {
  const u = stockUnit.trim().toLowerCase();
  if (u === 'kg') return { label: 'g', factor: 1000 };
  if (u === 'l' || u === 'ltr' || u === 'litre' || u === 'liter') return { label: 'ml', factor: 1000 };
  return { label: stockUnit, factor: 1 };
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
  category?: string;
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
    category: input.category,
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

export interface RecordPurchaseInput {
  restaurantId: string;
  inventoryItemId: string;
  quantity: number;
  costPerUnit: number;
  staffId: string;
  /** Defaults to now — override for a purchase entered a day (or more) late, so it still counts
   * against the day it actually happened rather than the day someone got around to logging it. */
  purchasedAt?: Date;
}

/** Logs a restock as money spent (for the Daily Expense report) AND adds the quantity to the
 * item's running stock, in one transaction — the two must never drift apart. This is the only
 * supported way to increase stock with a cost attached; editing "Quantity in stock" directly in
 * the item editor is for corrections/stocktakes and intentionally does not log an expense. Also
 * updates the item's costPerUnit to this purchase's price, so the next restock/recipe costing
 * defaults to the latest price paid rather than a stale one. */
export async function recordPurchase(input: RecordPurchaseInput): Promise<void> {
  const totalCost = round2(input.quantity * input.costPerUnit);
  const purchasedAt = input.purchasedAt ?? new Date();
  await db.transaction(async (tx) => {
    await tx.insert(inventoryPurchases).values({
      id: generateId(),
      restaurantId: input.restaurantId,
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      costPerUnit: input.costPerUnit,
      totalCost,
      staffId: input.staffId,
      purchasedAt,
    });
    await tx
      .update(inventoryItems)
      .set({
        quantity: sql`ROUND(${inventoryItems.quantity} + ${input.quantity}, 3)`,
        costPerUnit: input.costPerUnit,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, input.inventoryItemId));
  });
}

export interface DailyExpenseDay {
  /** YYYY-MM-DD, in local time. */
  date: string;
  total: number;
}

export interface DailyExpenseItem {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  total: number;
}

export interface DailyExpenseSummary {
  totalSpent: number;
  purchaseCount: number;
  byDay: DailyExpenseDay[];
  byItem: DailyExpenseItem[];
}

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Powers Reports > Daily Expense: how much was actually spent restocking inventory in a date
 * range (end exclusive, matching reportService.ts's DateRange convention), broken down by day
 * and by item — distinct from a current stock valuation, this is real money spent on real dates. */
export async function getDailyExpenseSummary(
  restaurantId: string,
  range: { start: Date; end: Date },
): Promise<DailyExpenseSummary> {
  const rows = await db.query.inventoryPurchases.findMany({
    where: and(
      eq(inventoryPurchases.restaurantId, restaurantId),
      gte(inventoryPurchases.purchasedAt, range.start),
      lt(inventoryPurchases.purchasedAt, range.end),
    ),
  });

  const totalSpent = round2(rows.reduce((sum, r) => sum + r.totalCost, 0));

  const byDayMap = new Map<string, number>();
  for (const r of rows) {
    const key = localDateKey(r.purchasedAt);
    byDayMap.set(key, round2((byDayMap.get(key) ?? 0) + r.totalCost));
  }
  const byDay = [...byDayMap.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const itemIds = [...new Set(rows.map((r) => r.inventoryItemId))];
  const items = itemIds.length
    ? await db.query.inventoryItems.findMany({ where: inArray(inventoryItems.id, itemIds) })
    : [];
  const itemById = new Map(items.map((i) => [i.id, i]));

  const byItemMap = new Map<string, { quantity: number; total: number }>();
  for (const r of rows) {
    const existing = byItemMap.get(r.inventoryItemId) ?? { quantity: 0, total: 0 };
    byItemMap.set(r.inventoryItemId, {
      quantity: round2(existing.quantity + r.quantity),
      total: round2(existing.total + r.totalCost),
    });
  }
  const byItem = [...byItemMap.entries()]
    .map(([inventoryItemId, agg]) => ({
      inventoryItemId,
      name: itemById.get(inventoryItemId)?.name ?? 'Unknown item',
      unit: itemById.get(inventoryItemId)?.unit ?? '',
      quantity: agg.quantity,
      total: agg.total,
    }))
    .sort((a, b) => b.total - a.total);

  return { totalSpent, purchaseCount: rows.length, byDay, byItem };
}
