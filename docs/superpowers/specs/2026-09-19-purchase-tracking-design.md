# Purchase Tracking (Supplier Bills, Purchase Report, Net Profit) — Design

## Context

The app already tracks inventory *spend* at the single-item level: the Inventory item editor has a "Record Restock" section (`recordPurchase()` in `src/features/inventory/inventoryService.ts`) that logs a dated, costed restock into `inventory_purchases` and bumps the item's stock in one transaction. Reports > Daily Expense sums that log by day and by item.

What's missing: a way to log a **real-world supplier bill** — multiple items bought at once, from one supplier, in one save — without having to open each inventory item separately and restock it one at a time. Also missing: a transactional list of past purchase bills (as opposed to Daily Expense's aggregated view), and a profit figure that combines purchase spend against sales revenue.

This spec covers three additions, all building on the existing `inventory_purchases` infrastructure rather than replacing it:
1. A multi-line **Purchase entry screen** (Owner + Captain)
2. A **Purchase Report** screen — list of past bills, drill into line items (Owner only)
3. **Purchases** and **Net Profit** cards folded into the existing Sales Reports home screen (Owner only)

## Non-goals (explicitly out of scope for this pass)

- Editing or voiding a saved purchase bill. A data-entry mistake is corrected the same way a stocktake correction is today: adjust the inventory item's quantity directly, or log a follow-up purchase. Revisit only if this proves to be a real pain point in practice.
- A dedicated suppliers table, supplier contact info, or per-supplier reporting. Supplier is a plain text field with autocomplete sourced from previously-typed values — same lightweight pattern as the existing item-name suggestions.
- Any change to who can see the Reports tab. It stays Owner-only, exactly as today. Only the *entry* screen for logging a purchase is opened up to Captain.

## Data model

### New table: `purchases` (the bill header)

Local (Drizzle, `src/db/schema/inventory.ts`) and Supabase (new migration), matching the existing `inventoryPurchases`/`inventory_purchases` conventions:

```
purchases
  id              TEXT PRIMARY KEY
  restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE
  supplier_name   TEXT               -- nullable; free text
  staff_id        TEXT NOT NULL      -- who logged it
  purchased_at    TIMESTAMP NOT NULL DEFAULT NOW()  -- date of the bill
  total_cost      NUMERIC(10,2) NOT NULL            -- sum of its line items, denormalized for the Purchase Report list
  created_at      TIMESTAMP DEFAULT NOW()
```

### `inventory_purchases` gets one new nullable column

```
ALTER TABLE inventory_purchases ADD COLUMN purchase_id TEXT REFERENCES purchases(id) ON DELETE CASCADE;
```

Nullable and additive — every restock already logged via the existing single-item "Record Restock" flow keeps `purchase_id = NULL` (not part of any bill, which is accurate). A new multi-line purchase writes one `purchases` row plus N `inventory_purchases` rows all sharing that `purchase_id`. Daily Expense's queries are untouched — they sum/group the flat `inventory_purchases` log regardless of `purchase_id`.

### Supplier autocomplete

No new table. Query `SELECT DISTINCT supplier_name FROM purchases WHERE restaurant_id = ? AND supplier_name IS NOT NULL ORDER BY ...` (most-recently-used first is a reasonable default), same shape as the existing inventory-item-name-suggestion query.

## New service functions (`src/features/inventory/inventoryService.ts` or a new `purchaseService.ts`)

- `getSupplierSuggestions(restaurantId, query)` — distinct supplier names matching a search string, capped (mirrors the existing item-name-match logic in the Inventory create screen).
- `recordSupplierPurchase(input)` — one transaction: for each line, resolve an inventory item (match existing by id, or create a new one first via `createInventoryItem`), insert one `inventory_purchases` row with the shared new `purchase_id`, and bump that item's stock/costPerUnit — reusing the same per-line update logic `recordPurchase()` already has, just looped and wrapped in one header insert.
- `listPurchases(restaurantId, range)` — purchase bills in a date range, for the Purchase Report list (id, supplier_name, purchased_at, total_cost, item count).
- `getPurchaseDetail(purchaseId)` — one bill's line items, for the Purchase Report detail view.
- `getPurchasesTotal(restaurantId, range)` — a single sum, for the new Sales-Reports-home "Purchases" card and the Net Profit calculation (`Net Sales − this`).

## UI

### Purchase entry screen — `app/(app)/inventory/purchase.tsx`

Reached from a new "+ Record Purchase" button on the Inventory list screen (`app/(app)/inventory/index.tsx`), next to the existing "+ Add Item" — Inventory is already shared by Owner and Captain, so no new tab or permission plumbing is needed.

- Supplier field: autocomplete as you type (reuses the same suggestion-row pattern as the existing item-name suggestions)
- Purchase date: defaults to today, editable (backdating a bill entered a day late is the same reasoning `recordPurchase()`'s `purchasedAt` already supports — see its doc comment)
- Repeatable line rows: item name (autocomplete against existing inventory items; picking a match locks in that item's unit; not matching keeps it as a "new item" line requiring a unit, with category optional — same requiredness as the standalone Inventory "+ Add Item" screen today, not stricter), quantity, cost per unit
- Running total footer
- "Save Purchase" calls `recordSupplierPurchase()`

### Purchase Report screen — `app/(app)/reports/purchases.tsx`

Reached from a new "Purchase Report" button on Reports home, alongside "Item-wise Sales" and "Daily Expense". Same date-range preset chips as the other report screens. List of bills (supplier, date, total, item count) → tap into a detail view of that bill's line items. Owner-only, same as the rest of Reports.

### Sales Reports home (`app/(app)/reports/index.tsx`)

Two new cards in the existing grid: **Purchases** (`getPurchasesTotal` for the selected range) and **Net Profit** (`summary.netSales - purchasesTotal`). Same preset chips already on the screen; no new date-picker UI.

## Sync / API wiring

`purchases` is added to the API's `TABLE_MAP` (`api/src/index.ts`), the client's sync push (`src/features/sync/syncService.ts`), and the client-side restore mirror (`src/features/setup/setupService.ts`'s `RESTORE_TABLE_ORDER`) — positioned after `restaurants` and before `inventoryPurchases` (parent-before-child, since `inventory_purchases.purchase_id` now references it). This is the exact same three-place wiring `inventoryPurchases` itself went through when it was added; no new pattern.

A corresponding Supabase migration (`supabase/migrations/011_purchases.sql`) creates the `purchases` table and adds the `purchase_id` column to `inventory_purchases` — this one needs to be run against the live database the same way `010_inventory_purchases.sql` was, before the API change referencing it goes live.

## Testing

- Unit tests for the profit math (`netSales - purchasesTotal`, including a zero-purchases-in-range case) alongside the existing `reportEngine`/`taxEngine` test style.
- Manual verification: log a multi-item purchase with one existing item and one brand-new item, confirm both the existing item's stock increases and the new item appears in Inventory; confirm the bill shows up in Purchase Report with correct line items; confirm Sales Reports home's Purchases/Net Profit cards reflect it for the right date range and not others.
