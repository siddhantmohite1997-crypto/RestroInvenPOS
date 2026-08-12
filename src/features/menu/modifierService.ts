import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { modifierGroups, modifiers, menuItemModifierGroups } from '@/db/schema';
import { generateId } from '@/lib/id';

export type ModifierGroup = typeof modifierGroups.$inferSelect;
export type Modifier = typeof modifiers.$inferSelect;
export type ModifierGroupWithModifiers = ModifierGroup & { modifiers: Modifier[] };

export async function listModifierGroups(restaurantId: string): Promise<ModifierGroupWithModifiers[]> {
  const groups = await db.query.modifierGroups.findMany({
    where: (g, { eq: eqOp }) => eqOp(g.restaurantId, restaurantId),
  });
  const withModifiers = await Promise.all(
    groups.map(async (group) => ({
      ...group,
      modifiers: await db.query.modifiers.findMany({
        where: (m, { and: andOp, eq: eqOp }) => andOp(eqOp(m.modifierGroupId, group.id), eqOp(m.isActive, true)),
        orderBy: (m, { asc }) => asc(m.sortOrder),
      }),
    })),
  );
  return withModifiers;
}

/** Modifier groups attached to one item, in display order — used by the order-entry modifier picker. */
export async function getModifierGroupsForItem(menuItemId: string): Promise<ModifierGroupWithModifiers[]> {
  const links = await db.query.menuItemModifierGroups.findMany({
    where: (l, { eq: eqOp }) => eqOp(l.menuItemId, menuItemId),
    orderBy: (l, { asc }) => asc(l.sortOrder),
  });
  const groups = await Promise.all(
    links.map(async (link) => {
      const group = await db.query.modifierGroups.findFirst({
        where: (g, { eq: eqOp }) => eqOp(g.id, link.modifierGroupId),
      });
      const groupModifiers = await db.query.modifiers.findMany({
        where: (m, { and: andOp, eq: eqOp }) =>
          andOp(eqOp(m.modifierGroupId, link.modifierGroupId), eqOp(m.isActive, true)),
        orderBy: (m, { asc }) => asc(m.sortOrder),
      });
      return group ? { ...group, modifiers: groupModifiers } : null;
    }),
  );
  return groups.filter((g): g is ModifierGroupWithModifiers => g !== null);
}

export interface ModifierGroupInput {
  restaurantId: string;
  name: string;
  selectionType: 'single' | 'multiple';
  isRequired?: boolean;
  minSelections?: number;
  maxSelections?: number;
}

export async function createModifierGroup(input: ModifierGroupInput): Promise<string> {
  const id = generateId();
  await db.insert(modifierGroups).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    selectionType: input.selectionType,
    isRequired: input.isRequired ?? false,
    minSelections: input.minSelections ?? 0,
    maxSelections: input.maxSelections,
  });
  return id;
}

export async function updateModifierGroup(id: string, input: Partial<ModifierGroupInput>): Promise<void> {
  await db
    .update(modifierGroups)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(modifierGroups.id, id));
}

export async function deleteModifierGroup(id: string): Promise<void> {
  await db.delete(menuItemModifierGroups).where(eq(menuItemModifierGroups.modifierGroupId, id));
  await db.delete(modifiers).where(eq(modifiers.modifierGroupId, id));
  await db.delete(modifierGroups).where(eq(modifierGroups.id, id));
}

export interface ModifierInput {
  modifierGroupId: string;
  name: string;
  priceDelta?: number;
  sortOrder?: number;
}

export async function createModifier(input: ModifierInput): Promise<string> {
  const id = generateId();
  await db.insert(modifiers).values({
    id,
    modifierGroupId: input.modifierGroupId,
    name: input.name,
    priceDelta: input.priceDelta ?? 0,
    sortOrder: input.sortOrder ?? 0,
  });
  return id;
}

export async function updateModifier(id: string, input: Partial<Omit<ModifierInput, 'modifierGroupId'>>): Promise<void> {
  await db.update(modifiers).set(input).where(eq(modifiers.id, id));
}

export async function deleteModifier(id: string): Promise<void> {
  await db.update(modifiers).set({ isActive: false }).where(eq(modifiers.id, id));
}

export async function attachModifierGroupToItem(
  menuItemId: string,
  modifierGroupId: string,
  sortOrder = 0,
): Promise<void> {
  await db.insert(menuItemModifierGroups).values({ menuItemId, modifierGroupId, sortOrder });
}

export async function detachModifierGroupFromItem(menuItemId: string, modifierGroupId: string): Promise<void> {
  await db
    .delete(menuItemModifierGroups)
    .where(
      and(
        eq(menuItemModifierGroups.menuItemId, menuItemId),
        eq(menuItemModifierGroups.modifierGroupId, modifierGroupId),
      ),
    );
}
