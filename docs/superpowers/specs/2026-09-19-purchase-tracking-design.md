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
- A standalone "Suppliers" management screen (editing a supplier's phone/GST after the fact, viewing all bills from one supplier, deactivating one). A real `suppliers` table is now part of this design (see below) specifically so this is cheap to add *later* without a data migration — but no such screen ships in this pass.
- Any per-supplier reporting (spend-by-supplier breakdowns, outstanding balance, payment terms/ledger). That's a meaningfully bigger accounts-payable-shaped feature; nothing so far suggests it's needed yet.
- Any change to who can see the Reports tab. It stays Owner-only, exactly as today. Only the *entry* screen for logging a purchase is opened up to Captain.

## Data model

### New table: `suppliers`

A light record, not a vendor-management module — just enough to give a supplier a stable identity across bills and to capture the two fields worth having from day one (phone, for lookup; GST number, since retrofitting it onto already-logged bills for tax/accounting purposes later is far more annoying than capturing it now):

```
suppliers
  id              TEXT PRIMARY KEY
  restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE
  name            TEXT NOT NULL
  phone           TEXT               -- nullable
  gst_number      TEXT               -- nullable
  created_at      TIMESTAMP DEFAULT NOW()
  updated_at      TIMESTAMP DEFAULT NOW()
```

### New table: `purchases` (the bill header)

Local (Drizzle, `src/db/schema/inventory.ts`) and Supabase (new migration), matching the existing `inventoryPurchases`/`inventory_purchases` conventions:

```
purchases
  id              TEXT PRIMARY KEY
  restaurant_id   TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE
  supplier_id     TEXT REFERENCES suppliers(id)     -- nullable; not every purchase has a named supplier (e.g. a cash market run)
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

### Supplier match-or-create

Same shape as the existing inventory-item-name-match logic: typing in the supplier field searches `suppliers WHERE restaurant_id = ? AND name ILIKE '%query%'` (most-recently-used first is a reasonable tiebreaker). Picking a suggestion sets `supplier_id` to that existing row. Typing a name that doesn't match anything keeps it as a "new supplier" — same pattern as a new inventory-item line — and surfaces two optional inline fields (Phone, GST number) so they can be captured at the moment the supplier is first entered, not retrofitted later. Saving the purchase creates the `suppliers` row first (name + whatever of phone/GST was filled in), then references its id from `purchases.supplier_id`.

## New service functions (`src/features/inventory/inventoryService.ts` or a new `purchaseService.ts`)

- `getSupplierSuggestions(restaurantId, query)` — suppliers matching a search string, capped (mirrors the existing item-name-match logic in the Inventory create screen).
- `recordSupplierPurchase(input)` — one transaction: resolve the supplier (match existing by id, or create a new `suppliers` row first from name + optional phone/GST), then for each line resolve an inventory item (match existing by id, or create a new one first via `createInventoryItem`), insert one `inventory_purchases` row with the shared new `purchase_id`, and bump that item's stock/costPerUnit — reusing the same per-line update logic `recordPurchase()` already has, just looped and wrapped in one header insert.
- `listPurchases(restaurantId, range)` — purchase bills in a date range, for the Purchase Report list (id, supplier name, purchased_at, total_cost, item count) — joins `suppliers` for the display name.
- `getPurchaseDetail(purchaseId)` — one bill's line items, for the Purchase Report detail view.
- `getPurchasesTotal(restaurantId, range)` — a single sum, for the new Sales-Reports-home "Purchases" card and the Net Profit calculation (`Net Sales − this`).

## UI

### Purchase entry screen — `app/(app)/inventory/purchase.tsx`

Reached from a new "+ Record Purchase" button on the Inventory list screen (`app/(app)/inventory/index.tsx`), next to the existing "+ Add Item" — Inventory is already shared by Owner and Captain, so no new tab or permission plumbing is needed.

- Supplier field: autocomplete as you type against existing suppliers; picking a match locks in that supplier, typing a new name reveals optional Phone and GST number fields inline (see "Supplier match-or-create" above)
- Purchase date: defaults to today, editable (backdating a bill entered a day late is the same reasoning `recordPurchase()`'s `purchasedAt` already supports — see its doc comment)
- Repeatable line rows: item name (autocomplete against existing inventory items; picking a match locks in that item's unit; not matching keeps it as a "new item" line requiring a unit, with category optional — same requiredness as the standalone Inventory "+ Add Item" screen today, not stricter), quantity, cost per unit
- Running total footer
- "Save Purchase" calls `recordSupplierPurchase()`

### Purchase Report screen — `app/(app)/reports/purchases.tsx`

Reached from a new "Purchase Report" button on Reports home, alongside "Item-wise Sales" and "Daily Expense". Same date-range preset chips as the other report screens. List of bills (supplier, date, total, item count) → tap into a detail view of that bill's line items. Owner-only, same as the rest of Reports.

### Sales Reports home (`app/(app)/reports/index.tsx`)

Two new cards in the existing grid: **Purchases** (`getPurchasesTotal` for the selected range) and **Net Profit** (`summary.netSales - purchasesTotal`). Same preset chips already on the screen; no new date-picker UI.

## Sync / API wiring

`suppliers` and `purchases` are both added to the API's `TABLE_MAP` (`api/src/index.ts`), the client's sync push (`src/features/sync/syncService.ts`), and the client-side restore mirror (`src/features/setup/setupService.ts`'s `RESTORE_TABLE_ORDER`) — positioned after `restaurants`, `suppliers` before `purchases`, both before `inventoryPurchases` (parent-before-child all the way down: restaurants → suppliers → purchases → inventoryPurchases, since `purchases.supplier_id` and `inventory_purchases.purchase_id` both reference something earlier in that chain). This is the exact same three-place wiring `inventoryPurchases` itself went through when it was added; no new pattern, just two more entries in each of the three places.

A corresponding Supabase migration (`supabase/migrations/011_purchases.sql`) creates both the `suppliers` and `purchases` tables and adds the `purchase_id` column to `inventory_purchases` — this one needs to be run against the live database the same way `010_inventory_purchases.sql` was, before the API change referencing it goes live.

## Testing

- Unit tests for the profit math (`netSales - purchasesTotal`, including a zero-purchases-in-range case) alongside the existing `reportEngine`/`taxEngine` test style.
- Manual verification: log a multi-item purchase with one existing item and one brand-new item, from a brand-new supplier (with phone + GST filled in), confirm the existing item's stock increases, the new item appears in Inventory, and the new supplier is saved with its details; log a second purchase picking that same supplier from suggestions and confirm it reuses the existing supplier row rather than creating a duplicate; confirm the bill shows up in Purchase Report with correct supplier name and line items; confirm Sales Reports home's Purchases/Net Profit cards reflect it for the right date range and not others.
