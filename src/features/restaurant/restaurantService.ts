import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { restaurants } from '@/db/schema';

export async function setTablesEnabled(restaurantId: string, enabled: boolean): Promise<void> {
  await db
    .update(restaurants)
    .set({ tablesEnabled: enabled, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));
}
