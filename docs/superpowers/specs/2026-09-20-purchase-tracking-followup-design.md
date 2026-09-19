# Purchase Tracking Follow-Up: Navigation, Vendor CRUD, Cleanup — Design

## Context

The Purchase Tracking feature (see `docs/superpowers/specs/2026-09-19-purchase-tracking-design.md`) shipped and was tested live on an Android emulator for the first time. That test surfaced five pieces of feedback, two of them small UI fixes and three of them a connected redesign of where purchase-related actions live in the app, whether the old single-item restock path still earns its place, and a new Vendor management screen the original spec deliberately deferred. This spec covers all five.

## Scope

### 1. Keyboard covers focused fields (app-wide)

The one prior fix for this class of bug (`b2566df`) only added `keyboardDismissMode="on-drag"` to individual screens' `ScrollView`s — that makes *dismissing* the keyboard easier once a field is known to be hidden, but never made a *focused* field scroll into view above the keyboard. The same gap showed up on the new Purchase entry screen. Rather than repeat the per-screen pattern across every form screen in the app, wrap the app once at its root: `app/_layout.tsx`'s `<Stack screenOptions={{ headerShown: false }} />` gets wrapped in a `KeyboardAvoidingView` (`behavior="height"`, `style={{ flex: 1 }}`, Android-only concern since this app only ships Android builds). Verified live on the running emulator (available for the first time this session) rather than by code inspection alone.

### 2. Date range presets can't reach further back than "this month"

All three report screens that will remain after this change (Sales Reports home, Item-wise Sales, Purchase Report — Daily Expense is being removed, see below) share one copy-pasted `PresetKey`/`PRESETS`/switch pattern backed by `today/yesterday/thisWeek/thisMonth` in `src/features/reports/dateRanges.ts`. Add a `monthsAgo(n, now)` function (`n=0` behaves identically to `thisMonth()`) and a "Pick a month" chip to each of the three screens — tapping it opens a `Modal` listing the last 24 months by name (e.g. "Aug 2026", "Jul 2026", ...), one per row, tap to select and close. This is the same dropdown-in-a-`Modal` shape `UnitPicker.tsx` already uses elsewhere in this app, not a new UI pattern. No new dependency — this app has no calendar/date-picker component, and a full custom start/end range was explicitly declined in favor of staying with the existing chip-based UI style.

### 3-5. Navigation restructure, Vendor CRUD, and removing superseded flows

These three are one connected change: where "Record Purchase" is reached from, a new Vendor management screen, and retiring two flows the new multi-item Purchase Tracking feature has made redundant.

**Navigation.** Today, Captain's Settings screen is just header info + Log out — all of Settings' management links (Business Details, Tax Rules, Staff, Sync) are gated Owner-only. A new shared screen, `app/(app)/more/index.tsx`, lists two rows: "Add Purchase Record" (navigates to the existing `/inventory/purchase`) and "Vendors" (navigates to the new `/vendors` list, below). Two ways to reach it:
- Captain gets a new 7th bottom tab, "More" (`app/(app)/_layout.tsx`), visible under the same `!isWaiter` condition already used for Inventory/Recipes/Menu, placed directly before the existing Settings tab (last-but-one).
- Owner reaches the identical screen via a new link row inside Settings' existing Owner-gated section (`app/(app)/settings/index.tsx`), not a new tab.
- Waiter sees neither — consistent with every other Purchase Tracking surface being Owner/Captain only.
- The Inventory list screen (`app/(app)/inventory/index.tsx`) loses its "+ Record Purchase" button, reverting to just "+ Add Item" — Inventory goes back to being purely about inventory, per the "keep only inventory, keep it simple" feedback.
- Tapping "Add Purchase Record" from the new More screen pushes `/inventory/purchase`, which lives under the Inventory tab's own stack — Expo Router will switch to the Inventory tab to show it (the same cross-tab navigation behavior every deep link in this app already has). This is expected, not a defect to engineer around.

**Vendor CRUD.** A new `app/(app)/vendors/index.tsx` (list) and `app/(app)/vendors/[id].tsx` (create/edit), mirroring the Inventory list+detail pattern already established in this codebase:
- Fields: name, phone, GST number — exactly the `suppliers` table as it exists today. No new fields.
- `suppliers` gains a new `isActive` column (Drizzle: `integer('is_active', { mode: 'boolean' }).notNull().default(true)`, matching `inventoryItems.isActive` exactly), plus a corresponding Supabase migration. Deleting a vendor sets `isActive = false` rather than removing the row — consistent with this codebase's established soft-delete convention, and necessary since `purchases.supplier_id` has no `ON DELETE` behavior specified, so a hard delete would fail outright for any vendor with purchase history.
- New functions added to `src/features/inventory/purchaseService.ts` (where supplier logic already lives): `listVendors(restaurantId)` (active only), `getVendor(id)`, `createVendor(input)`, `updateVendor(id, input)`, `deleteVendor(id)` (soft-delete).
- `getSupplierSuggestions` (the Purchase entry screen's autocomplete) gets updated to exclude soft-deleted vendors — today it has no such filter since the column doesn't exist yet.
- Both Owner and Captain get identical full CRUD (create, edit, soft-delete) — the only gate is whether a role can reach the More screen at all.
- Explicitly still out of scope, matching the original spec's non-goals: no per-vendor reporting (spend-by-supplier, purchase history view), no address/notes/contact-person fields, no un-delete UI (re-adding a vendor by the same name after deleting it just creates a new active row — the match-or-create autocomplete in Purchase entry only ever suggests active suppliers).

**Removals** (clean cutover — accepted consequence: any restock logged before this cutover via the old single-item flow has no `purchases` header row and will not appear in any report going forward, since Purchase Report only lists bills logged through the new multi-item flow):
- The "Record restock" section is removed from the Inventory Item screen (`app/(app)/inventory/[id].tsx`).
- `recordPurchase()` is removed from `src/features/inventory/inventoryService.ts` — confirmed its only caller is the section being removed.
- The Daily Expense report screen (`app/(app)/reports/daily-expense.tsx`) is removed entirely, along with its route in `app/(app)/reports/_layout.tsx` and its button on Reports home (`app/(app)/reports/index.tsx`).
- `getDailyExpenseSummary()` and its associated types (`DailyExpenseDay`, `DailyExpenseItem`, `DailyExpenseSummary`, `localDateKey`) are removed from `inventoryService.ts` — confirmed its only caller is the screen being removed.
- The `inventory_purchases` table, `recordSupplierPurchase()`, and everything else Purchase Tracking built are untouched — this only removes the old single-item entry point and its dedicated report, not the underlying log table both old and new flows share.

## Data model

```
ALTER TABLE suppliers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
```

Local (Drizzle) and Supabase (new migration `supabase/migrations/012_supplier_soft_delete.sql`), additive and nullable-free (default `true` means every existing supplier row stays active with no backfill step needed).

## Testing

- Unit tests for `monthsAgo(n, now)` alongside the existing `dateRanges.test.ts` style (covers `n=0` matching `thisMonth()`, a mid-year offset, and a year-boundary-crossing offset).
- Manual verification, this time actually possible on the running emulator rather than substituted with source review:
  - Keyboard fix: tap through every field on the Purchase entry screen and confirm each stays visible above the keyboard; confirm tapping outside a field or scrolling dismisses it.
  - Navigation: log in as Captain, confirm the new "More" tab appears and both its rows work; log in as Owner, confirm the same screen is reachable from Settings instead, and that Owner has no "More" tab; confirm Waiter has neither.
  - Vendor CRUD: create a vendor, edit it, soft-delete it, confirm it disappears from the Vendors list and from Purchase entry's supplier autocomplete, and that Purchase Report bills already attributed to it still show its name correctly.
  - Date range: confirm the month-picker chip on all three remaining report screens correctly shows data for a month other than the current one.
  - Confirm the Inventory list has only "+ Add Item", the Inventory Item screen has no Restock section, and Reports home has no Daily Expense button/route.

## Non-goals (unchanged or newly reaffirmed)

- No per-vendor reporting (spend-by-supplier breakdowns, outstanding balance) — still explicitly out of scope, same reasoning as the original spec.
- No full custom start/end date-range picker — staying with the chip-based month list; revisit only if a real need for arbitrary ranges (not just "further back") shows up.
- No un-delete / vendor history UI.
- No change to who can see the Reports tab (still Owner-only) or Billing/Tables (still Captain-only) — this spec only adds the new Owner/Captain-shared "More" surface.
