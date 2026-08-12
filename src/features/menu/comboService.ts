import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { comboDeals, comboDealItems } from '@/db/schema';
import { generateId } from '@/lib/id';

export type ComboDeal = typeof comboDeals.$inferSelect;
export type ComboDealItem = typeof comboDealItems.$inferSelect;
export type ComboDealWithItems = ComboDeal & {
  items: (ComboDealItem & { menuItemName: string })[];
};

export async function listCombos(restaurantId: string): Promise<ComboDealWithItems[]> {
  const combos = await db.query.comboDeals.findMany({
    where: (c, { and, eq: eqOp }) => and(eqOp(c.restaurantId, restaurantId), eqOp(c.isActive, true)),
  });
  return Promise.all(combos.map((combo) => getComboWithItems(combo.id).then((c) => c!)));
}

export async function getComboWithItems(id: string): Promise<ComboDealWithItems | null> {
  const combo = await db.query.comboDeals.findFirst({ where: eq(comboDeals.id, id) });
  if (!combo) return null;
  const items = await db.query.comboDealItems.findMany({
    where: (ci, { eq: eqOp }) => eqOp(ci.comboDealId, id),
  });
  const itemsWithNames = await Promise.all(
    items.map(async (item) => {
      const menuItem = await db.query.menuItems.findFirst({
        where: (m, { eq: eqOp }) => eqOp(m.id, item.menuItemId),
      });
      return { ...item, menuItemName: menuItem?.name ?? 'Unknown item' };
    }),
  );
  return { ...combo, items: itemsWithNames };
}

export interface ComboDealInput {
  restaurantId: string;
  name: string;
  price: number;
  imageUri?: string;
  taxRuleId?: string;
  items: { menuItemId: string; quantity: number; allowSubstitution?: boolean }[];
}

export async function createCombo(input: ComboDealInput): Promise<string> {
  const id = generateId();
  await db.insert(comboDeals).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    price: input.price,
    imageUri: input.imageUri,
    taxRuleId: input.taxRuleId,
  });
  for (const item of input.items) {
    await db.insert(comboDealItems).values({
      id: generateId(),
      comboDealId: id,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      allowSubstitution: item.allowSubstitution ?? false,
    });
  }
  return id;
}

export async function updateCombo(
  id: string,
  input: Partial<Pick<ComboDealInput, 'name' | 'price' | 'imageUri' | 'taxRuleId'>> & {
    items?: ComboDealInput['items'];
  },
): Promise<void> {
  const { items, ...fields } = input;
  if (Object.keys(fields).length > 0) {
    await db
      .update(comboDeals)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(comboDeals.id, id));
  }
  if (items) {
    await db.delete(comboDealItems).where(eq(comboDealItems.comboDealId, id));
    for (const item of items) {
      await db.insert(comboDealItems).values({
        id: generateId(),
        comboDealId: id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        allowSubstitution: item.allowSubstitution ?? false,
      });
    }
  }
}

export async function deleteCombo(id: string): Promise<void> {
  await db.update(comboDeals).set({ isActive: false, updatedAt: new Date() }).where(eq(comboDeals.id, id));
}
