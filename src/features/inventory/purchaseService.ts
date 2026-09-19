import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { suppliers, purchases, inventoryItems, inventoryPurchases } from '@/db/schema';
import { generateId } from '@/lib/id';
import { round2 } from '@/features/tax/taxEngine';

export type Supplier = typeof suppliers.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;

/** Suppliers matching a search string, most-recently-updated first -- same match-or-create
 * shape as the existing inventory-item-name suggestions in the Inventory create screen. */
export async function getSupplierSuggestions(restaurantId: string, query: string): Promise<Supplier[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const all = await db.query.suppliers.findMany({
    where: eq(suppliers.restaurantId, restaurantId),
    orderBy: (s, { desc }) => desc(s.updatedAt),
  });
  const q = trimmed.toLowerCase();
  return all.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
}

export interface PurchaseLineInput {
  /** Set when this line matches an existing inventory item picked from suggestions. */
  inventoryItemId?: string;
  /** Set instead of inventoryItemId when this line is a brand-new inventory item. */
  newItemName?: string;
  newItemUnit?: string;
  newItemCategory?: string;
  quantity: number;
  costPerUnit: number;
}

export interface RecordSupplierPurchaseInput {
  restaurantId: string;
  staffId: string;
  /** Defaults to now -- same backdating reasoning as recordPurchase()'s purchasedAt. */
  purchasedAt?: Date;
  /** Set when the supplier matches one picked from suggestions. */
  supplierId?: string;
  /** Set instead of supplierId when this is a brand-new supplier. Omit both for no supplier at
   * all (e.g. a cash market run with nothing to attribute the bill to). */
  newSupplierName?: string;
  newSupplierPhone?: string;
  newSupplierGstNumber?: string;
  lines: PurchaseLineInput[];
}

/** Logs a multi-item supplier bill in one transaction: resolves (or creates) the supplier,
 * resolves (or creates) each line's inventory item, writes one inventory_purchases row per
 * line sharing this bill's purchase_id, and bumps each item's stock/costPerUnit -- the same
 * per-line update recordPurchase() does for a single-item restock, just looped here and never
 * going through that function directly (or through createInventoryItem), since both of those
 * use the top-level `db` and would not participate in this transaction. */
export async function recordSupplierPurchase(input: RecordSupplierPurchaseInput): Promise<string> {
  const purchasedAt = input.purchasedAt ?? new Date();

  return db.transaction(async (tx) => {
    let supplierId: string | undefined = input.supplierId;
    if (!supplierId && input.newSupplierName?.trim()) {
      supplierId = generateId();
      await tx.insert(suppliers).values({
        id: supplierId,
        restaurantId: input.restaurantId,
        name: input.newSupplierName.trim(),
        phone: input.newSupplierPhone?.trim() || null,
        gstNumber: input.newSupplierGstNumber?.trim() || null,
      });
    }

    const purchaseId = generateId();
    let totalCost = 0;

    for (const line of input.lines) {
      const lineTotal = round2(line.quantity * line.costPerUnit);
      totalCost = round2(totalCost + lineTotal);

      let inventoryItemId = line.inventoryItemId;
      if (!inventoryItemId) {
        inventoryItemId = generateId();
        await tx.insert(inventoryItems).values({
          id: inventoryItemId,
          restaurantId: input.restaurantId,
          name: line.newItemName!,
          category: line.newItemCategory || undefined,
          unit: line.newItemUnit!,
          quantity: 0,
          costPerUnit: line.costPerUnit,
        });
      }

      await tx.insert(inventoryPurchases).values({
        id: generateId(),
        restaurantId: input.restaurantId,
        inventoryItemId,
        purchaseId,
        quantity: line.quantity,
        costPerUnit: line.costPerUnit,
        totalCost: lineTotal,
        staffId: input.staffId,
        purchasedAt,
      });

      await tx
        .update(inventoryItems)
        .set({
          quantity: sql`ROUND(${inventoryItems.quantity} + ${line.quantity}, 3)`,
          costPerUnit: line.costPerUnit,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, inventoryItemId));
    }

    await tx.insert(purchases).values({
      id: purchaseId,
      restaurantId: input.restaurantId,
      supplierId,
      staffId: input.staffId,
      purchasedAt,
      totalCost,
    });

    return purchaseId;
  });
}
