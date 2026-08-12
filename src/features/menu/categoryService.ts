import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { categories } from '@/db/schema';
import { generateId } from '@/lib/id';

export type Category = typeof categories.$inferSelect;

export async function listCategories(restaurantId: string): Promise<Category[]> {
  return db.query.categories.findMany({
    where: (c, { and, eq: eqOp }) => and(eqOp(c.restaurantId, restaurantId), eqOp(c.isActive, true)),
    orderBy: (c, { asc }) => asc(c.sortOrder),
  });
}

export interface CategoryInput {
  restaurantId: string;
  name: string;
  sortOrder?: number;
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const id = generateId();
  await db.insert(categories).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    sortOrder: input.sortOrder ?? 0,
  });
  return id;
}

export async function updateCategory(
  id: string,
  input: Partial<Pick<CategoryInput, 'name' | 'sortOrder'>>,
): Promise<void> {
  await db
    .update(categories)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(categories.id, id));
}

/** Soft delete: menu items reference categoryId, so we never hard-delete. */
export async function deleteCategory(id: string): Promise<void> {
  await db.update(categories).set({ isActive: false, updatedAt: new Date() }).where(eq(categories.id, id));
}
