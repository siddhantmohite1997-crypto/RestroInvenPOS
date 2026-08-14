import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { diningTables } from '@/db/schema';
import { generateId } from '@/lib/id';

export type DiningTable = typeof diningTables.$inferSelect;

export async function listTables(restaurantId: string): Promise<DiningTable[]> {
  return db.query.diningTables.findMany({
    where: (t, { eq: eqOp }) => eqOp(t.restaurantId, restaurantId),
    orderBy: (t, { asc }) => asc(t.name),
  });
}

export async function createTable(restaurantId: string, name: string, capacity?: number): Promise<string> {
  const id = generateId();
  await db.insert(diningTables).values({ id, restaurantId, name, capacity, status: 'free' });
  return id;
}

export async function deleteTable(id: string): Promise<void> {
  await db.delete(diningTables).where(eq(diningTables.id, id));
}

export async function setTableStatus(
  id: string,
  status: 'free' | 'occupied' | 'billed',
  currentOrderId: string | null,
): Promise<void> {
  await db
    .update(diningTables)
    .set({ status, currentOrderId, updatedAt: new Date() })
    .where(eq(diningTables.id, id));
}
