import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { taxRules, taxComponents } from '@/db/schema';
import { generateId } from '@/lib/id';

export type TaxRule = typeof taxRules.$inferSelect;
export type TaxComponent = typeof taxComponents.$inferSelect;
export type TaxRuleWithComponents = TaxRule & { components: TaxComponent[] };

export async function listTaxRules(restaurantId: string): Promise<TaxRuleWithComponents[]> {
  const rules = await db.query.taxRules.findMany({
    where: (t, { eq: eqOp }) => eqOp(t.restaurantId, restaurantId),
  });
  const withComponents = await Promise.all(
    rules.map(async (rule) => ({
      ...rule,
      components: await db.query.taxComponents.findMany({
        where: (c, { eq: eqOp }) => eqOp(c.taxRuleId, rule.id),
      }),
    })),
  );
  return withComponents;
}

export interface TaxRuleInput {
  restaurantId: string;
  name: string;
  isDefault?: boolean;
  components: { label: string; ratePercent: number }[];
}

export async function createTaxRule(input: TaxRuleInput): Promise<string> {
  const id = generateId();
  const totalRatePercent = input.components.reduce((sum, c) => sum + c.ratePercent, 0);

  if (input.isDefault) {
    await db
      .update(taxRules)
      .set({ isDefault: false })
      .where(eq(taxRules.restaurantId, input.restaurantId));
  }

  await db.insert(taxRules).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    totalRatePercent,
    isDefault: input.isDefault ?? false,
    isActive: true,
  });

  for (const [index, component] of input.components.entries()) {
    await db.insert(taxComponents).values({
      id: generateId(),
      taxRuleId: id,
      label: component.label,
      ratePercent: component.ratePercent,
      sortOrder: index,
    });
  }

  return id;
}

export async function deleteTaxRule(id: string): Promise<void> {
  await db.update(taxRules).set({ isActive: false }).where(eq(taxRules.id, id));
}
