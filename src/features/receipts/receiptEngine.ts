import { round2 } from '@/features/tax/taxEngine';

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifierNames: string[];
}

export interface ReceiptTaxComponent {
  label: string;
  amount: number;
}

export interface ReceiptOrderItemInput {
  nameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  lineSubtotal: number;
  lineDiscountTotal: number;
  taxComponentsSnapshot: string | null;
  modifierNames?: string[];
}

/**
 * Sums each named tax component (e.g. CGST, SGST) across all order lines, computed on each
 * line's post-discount amount. Lines without a tax rule (taxComponentsSnapshot is null) simply
 * don't contribute — this is what makes the breakdown "by slab" rather than one blended number.
 */
export function computeTaxComponentBreakdown(items: ReceiptOrderItemInput[]): ReceiptTaxComponent[] {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (!item.taxComponentsSnapshot) continue;
    const taxable = Math.max(0, item.lineSubtotal - item.lineDiscountTotal);
    let components: { label: string; ratePercent: number }[];
    try {
      components = JSON.parse(item.taxComponentsSnapshot);
    } catch {
      continue;
    }
    for (const component of components) {
      const amount = round2(taxable * (component.ratePercent / 100));
      totals.set(component.label, round2((totals.get(component.label) ?? 0) + amount));
    }
  }

  return Array.from(totals.entries()).map(([label, amount]) => ({ label, amount }));
}

export function toReceiptLineItems(items: ReceiptOrderItemInput[]): ReceiptLineItem[] {
  return items.map((item) => ({
    name: item.nameSnapshot,
    quantity: item.quantity,
    unitPrice: item.unitPriceSnapshot,
    lineTotal: item.lineSubtotal,
    modifierNames: item.modifierNames ?? [],
  }));
}
