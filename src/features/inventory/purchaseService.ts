import { eq, sql } from 'drizzle-orm';
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

    const totalCost = round2(
      input.lines.reduce((sum, line) => round2(sum + round2(line.quantity * line.costPerUnit)), 0),
    );

    const purchaseId = generateId();

    await tx.insert(purchases).values({
      id: purchaseId,
      restaurantId: input.restaurantId,
      supplierId,
      staffId: input.staffId,
      purchasedAt,
      totalCost,
    });

    for (const line of input.lines) {
      const lineTotal = round2(line.quantity * line.costPerUnit);

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

    return purchaseId;
  });
}

export interface PurchaseListRow {
  id: string;
  supplierName: string | null;
  purchasedAt: Date;
  totalCost: number;
  itemCount: number;
}

/** Purchase bills in a date range (end exclusive, matching reportService.ts's DateRange
 * convention), newest first -- powers the Purchase Report list screen. */
export async function listPurchases(
  restaurantId: string,
  range: { start: Date; end: Date },
): Promise<PurchaseListRow[]> {
  const rows = await db.query.purchases.findMany({
    where: (p, { and: andOp, eq: eqOp, gte, lt }) =>
      andOp(eqOp(p.restaurantId, restaurantId), gte(p.purchasedAt, range.start), lt(p.purchasedAt, range.end)),
    orderBy: (p, { desc }) => desc(p.purchasedAt),
  });
  if (rows.length === 0) return [];

  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((id): id is string => !!id))];
  const supplierRows = supplierIds.length
    ? await db.query.suppliers.findMany({ where: (s, { inArray }) => inArray(s.id, supplierIds) })
    : [];
  const supplierById = new Map(supplierRows.map((s) => [s.id, s]));

  const purchaseIds = rows.map((r) => r.id);
  const lineRows = await db.query.inventoryPurchases.findMany({
    where: (ip, { inArray }) => inArray(ip.purchaseId, purchaseIds),
  });
  const countByPurchase = new Map<string, number>();
  for (const line of lineRows) {
    if (!line.purchaseId) continue;
    countByPurchase.set(line.purchaseId, (countByPurchase.get(line.purchaseId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    supplierName: r.supplierId ? (supplierById.get(r.supplierId)?.name ?? null) : null,
    purchasedAt: r.purchasedAt,
    totalCost: r.totalCost,
    itemCount: countByPurchase.get(r.id) ?? 0,
  }));
}

export interface PurchaseDetailLine {
  id: string;
  itemName: string;
  unit: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
}

export interface PurchaseDetail {
  id: string;
  supplierName: string | null;
  purchasedAt: Date;
  totalCost: number;
  lines: PurchaseDetailLine[];
}

/** One bill's line items -- powers the Purchase Report detail view reached by tapping a row in
 * the list from listPurchases(). Returns null if the id doesn't exist (deep-link to a stale id,
 * or the restaurant was reset). */
export async function getPurchaseDetail(purchaseId: string): Promise<PurchaseDetail | null> {
  const purchase = await db.query.purchases.findFirst({ where: eq(purchases.id, purchaseId) });
  if (!purchase) return null;

  const supplier = purchase.supplierId
    ? await db.query.suppliers.findFirst({ where: eq(suppliers.id, purchase.supplierId) })
    : null;

  const lineRows = await db.query.inventoryPurchases.findMany({
    where: eq(inventoryPurchases.purchaseId, purchaseId),
  });
  const itemIds = [...new Set(lineRows.map((l) => l.inventoryItemId))];
  const itemRows = itemIds.length
    ? await db.query.inventoryItems.findMany({ where: (i, { inArray }) => inArray(i.id, itemIds) })
    : [];
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  return {
    id: purchase.id,
    supplierName: supplier?.name ?? null,
    purchasedAt: purchase.purchasedAt,
    totalCost: purchase.totalCost,
    lines: lineRows.map((l) => ({
      id: l.id,
      itemName: itemById.get(l.inventoryItemId)?.name ?? 'Unknown item',
      unit: itemById.get(l.inventoryItemId)?.unit ?? '',
      quantity: l.quantity,
      costPerUnit: l.costPerUnit,
      totalCost: l.totalCost,
    })),
  };
}

/** A single sum over a date range -- powers Sales Reports home's "Purchases" card and, combined
 * with Net Sales, calculateNetProfit(). Sums purchases.total_cost directly (the bill-level
 * total) rather than inventory_purchases lines, so this is correct regardless of whether every
 * line item's purchasedAt exactly matches its parent bill's purchasedAt (they always will in
 * practice, but this is the more direct query for "what did bills in this range cost"). */
export async function getPurchasesTotal(restaurantId: string, range: { start: Date; end: Date }): Promise<number> {
  const rows = await db.query.purchases.findMany({
    where: (p, { and: andOp, eq: eqOp, gte, lt }) =>
      andOp(eqOp(p.restaurantId, restaurantId), gte(p.purchasedAt, range.start), lt(p.purchasedAt, range.end)),
  });
  return round2(rows.reduce((sum, r) => sum + r.totalCost, 0));
}
