import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { menuItems } from '@/db/schema';
import { generateId } from '@/lib/id';

export type MenuItem = typeof menuItems.$inferSelect;

export async function listItems(restaurantId: string, categoryId?: string): Promise<MenuItem[]> {
  return db.query.menuItems.findMany({
    where: (i, { and, eq: eqOp }) =>
      categoryId
        ? and(eqOp(i.restaurantId, restaurantId), eqOp(i.isActive, true), eqOp(i.categoryId, categoryId))
        : and(eqOp(i.restaurantId, restaurantId), eqOp(i.isActive, true)),
    orderBy: (i, { asc }) => asc(i.sortOrder),
  });
}

export async function getItem(id: string): Promise<MenuItem | null> {
  const row = await db.query.menuItems.findFirst({ where: eq(menuItems.id, id) });
  return row ?? null;
}

export interface MenuItemInput {
  restaurantId: string;
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  imageUri?: string;
  taxRuleId?: string;
  isServiceChargeExempt?: boolean;
  sortOrder?: number;
}

export async function createItem(input: MenuItemInput): Promise<string> {
  const id = generateId();
  await db.insert(menuItems).values({
    id,
    restaurantId: input.restaurantId,
    categoryId: input.categoryId,
    name: input.name,
    description: input.description,
    price: input.price,
    imageUri: input.imageUri,
    taxRuleId: input.taxRuleId,
    isServiceChargeExempt: input.isServiceChargeExempt ?? false,
    sortOrder: input.sortOrder ?? 0,
  });
  return id;
}

export async function updateItem(id: string, input: Partial<MenuItemInput>): Promise<void> {
  await db
    .update(menuItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(menuItems.id, id));
}

/** Kept as its own function since this is the "1-2 taps" action reachable from both Menu and Billing. */
export async function setOutOfStock(id: string, isOutOfStock: boolean): Promise<void> {
  await db.update(menuItems).set({ isOutOfStock, updatedAt: new Date() }).where(eq(menuItems.id, id));
}

/** Soft delete: order history references menuItemId. */
export async function deleteItem(id: string): Promise<void> {
  await db.update(menuItems).set({ isActive: false, updatedAt: new Date() }).where(eq(menuItems.id, id));
}
