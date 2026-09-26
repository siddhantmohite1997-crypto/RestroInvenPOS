# Bidirectional Sync (Multi-Device Visibility) — Design

## Context

A live client (Quality Bites) has three staff using this app across multiple devices — an Owner, a Captain (Manager), and a Waiter. Orders placed on the Waiter's/Captain's device reach Supabase fine (sync already pushes local → cloud correctly), but the Owner's device never sees them: Reports, Billing, and Inventory all read exclusively from that device's own local SQLite, and this app's sync has never had a way to pull another device's changes back down after the one-time pairing snapshot. Confirmed directly against production data: 12 real orders existed in Supabase for Quality Bites today; the Owner's Reports screen showed all zeros.

This spec adds real two-way sync so every device converges on the same data, with one deliberate exception: inventory *quantity* is handled through a separate, more careful mechanism (see Part 2), because it is the one field in this app where two devices can legitimately make concurrent, independent, correct changes that must both be kept (two simultaneous sales of the same item) — something plain last-write-wins would silently corrupt.

## Non-goals (explicitly out of scope for this pass)

- Real-time push notifications / websockets. Freshness is "periodic while the app is open," not instant.
- Field-level merge or a conflict-resolution UI. Every non-inventory table resolves conflicts by whole-row last-write-wins; there is no scenario in this app today where two devices are expected to edit the same non-inventory row at the same moment in materially different ways (an order belongs to whichever device is actively serving that table).
- Any change to what Waiter can see. This spec is about devices converging on the same underlying data; role-based screen visibility (Waiter has no Reports tab, etc.) is unchanged.
- Historical backfill/repair of data already silently lost to a past sync gap. This spec prevents the problem going forward; it does not attempt to reconstruct what a device might have missed before this ships.

## Part 1: Generic bidirectional sync

### Mechanism

`POST /sync` (already exists) gains a second direction in the same request/response, rather than becoming a new endpoint — it already carries PIN auth and the full TABLE_MAP, and push and pull will always happen together on the same tick, so splitting them into two round-trips buys nothing.

**Request** gains one new field: `lastPulledAt: string | null` (ISO-8601; `null` means "this device has never pulled — send everything").

**Response** gains two new fields:
- `pulledData: Record<string, unknown[]>` — one entry per TABLE_MAP table, containing every row that changed on the server since `lastPulledAt`, in the same parent-before-child order already used by `/restore`.
- `newPulledAt: string` — the server's own clock at query time. The client stores this (not its own clock) as the next cursor, so client/server clock skew can never cause a row to be missed.

A freshly-paired device already receives everything via the existing one-time `/restore` call — its first periodic sync must not redundantly re-pull the same full history through `lastPulledAt: null`. `restoreFromCloud()` sets `lastPulledAt` (via the new `setLastPulledAt`, see Data model changes below) to "now" immediately after a successful restore, the same moment it already records the pairing as complete — so the device's very next periodic tick pulls only what's changed since then, not its whole history a second time.

Server-side, for each table in TABLE_MAP (in the existing parent-before-child order), the handler runs the mirror image of what push already does: `SELECT * FROM <table> WHERE restaurant_id = ? AND updated_at > ?` for tables with an `updated_at` column, or `WHERE created_at > ?` for append-only tables (`inventory_purchases`, `audit_logs`, `purchases` — same distinction already used on the push side). For `orders` specifically, the query finds orders that changed since the cursor, then — exactly like the existing push logic — includes ALL of that order's current `order_items`, `order_item_modifiers`, `discounts`, and `payments` rows regardless of their own timestamps, since the push side already treats an order's children as "resend in full whenever the parent changed" rather than diffing them individually.

Client-side, `pulledData` is applied table-by-table in the same parent-before-child order, via upsert-by-id (insert if the row doesn't exist locally, replace if it does) — **except** `inventoryItems`, where only every column *other than* `quantity` is applied this way (`quantity` itself is always simply adopted from the incoming row, see Part 2 for why), and **except** `menuItemModifierGroups`, which has no single `id` column (a composite `menuItemId`+`modifierGroupId` key, already handled specially on the push side for the same reason) — its upsert matches on that composite key instead.

### Conflict resolution

Whole-row last-write-wins by `updated_at`, applied identically in both directions (push already implicitly does this via `filterChangedSince`; pull does the same comparison client-side before overwriting a local row — if the local row's `updated_at` is newer than the incoming one, skip it, since a device should never let an older cloud snapshot regress a more recent local edit it hasn't pushed yet).

### Client trigger

A new `usePeriodicSync()` hook (installed once, at the same app-root level as the existing `useSyncGate()`), using React Native's `AppState` to run a combined push+pull `syncNow()`-equivalent call every 120 seconds while the app is in the foreground and a restaurant/PIN is active, and to pause entirely while backgrounded (no wasted battery/data when the app isn't in use). Unlike the existing manual-sync and once-daily-auto-sync paths, this periodic tick is silent on failure — it retries on the next tick rather than alerting the user, since surfacing a popup every two minutes on a spotty connection would be worse than the problem it's fixing. Failures are still recorded via the existing `logSyncAttempt`, so they're visible in Settings → Sync's history if someone goes looking.

## Part 2: Inventory quantity (server-authoritative deltas)

### Why quantity is different

Every other field in this app effectively has one real writer at a time in practice (a menu item's price, a staff member's role, an order's own fields while it's being actively served). Quantity is the exception: two devices can each independently and correctly sell the last few units of the same item within the same minute. Whole-row last-write-wins would let one sale's decrement silently overwrite the other's — the stock count would be wrong with no error, no log, and no way to notice until someone counts the shelf.

### The rule

Every place that changes `inventory_items.quantity` stops writing an absolute number that later gets pushed as part of the generic row sync. Instead, each becomes an explicit operation against a new endpoint, applied server-side as an atomic SQL update (`quantity = quantity + delta` or `quantity = <setAbsolute>`) — so two devices' operations on the same item both land correctly regardless of arrival order, because the server is doing arithmetic on its own current value, not accepting a client's snapshot of what it thinks the value is.

There are two shapes of operation, because a sale/restock and a stocktake correction are fundamentally different in kind:
- **Delta** (`delta: number`) — for anything that is naturally a relative change: selling an item (recipe consumption, negative delta), restoring a voided/cancelled order's consumed stock (positive delta), and restocking via the Purchase entry screen (positive delta, per line).
- **Absolute set** (`setAbsolute: number`) — for a manual stocktake correction in the Inventory item editor ("I counted the shelf, it's actually 12kg"). This is a deliberate human observation overriding the system's running count, not a concurrent-writer race the way sales are — so it is allowed to simply set the value, the same way it works today, just now going through the server instead of riding along with the generic sync.

### New endpoint: `POST /inventory/adjust-stock`

Request: `{ restaurantId, pin, inventoryItemId, delta?: number, setAbsolute?: number, reason: string }` — exactly one of `delta`/`setAbsolute` is provided. `reason` is a short machine string (`"sale"`, `"sale-void"`, `"restock"`, `"correction"`) recorded for debugging, not shown in any UI in this pass.

Response: `{ quantity: number }` — the item's new authoritative quantity after the operation, computed and returned in the same request so the calling device can immediately reconcile its optimistic local value if it drifted.

### Never blocking the till

Every call site (recipe consumption/restoration on an order, Purchase entry's stock bump, a manual correction save) does two things, in this order:
1. **Always** apply the same delta/set to the local SQLite `inventory_items.quantity` immediately, exactly as today — so the UI updates instantly and the sale/save is never blocked on network state.
2. **Attempt** the live call to `/inventory/adjust-stock`. If it succeeds, done — the server and this device now agree. If it fails (offline, timeout, server error), write the operation to a new local-only outbox table instead of surfacing an error to the person at the till.

### New local table: `pending_inventory_deltas`

Local-only (never part of TABLE_MAP, never pushed/pulled as a regular row) — Drizzle schema, `src/db/schema/inventory.ts`:
```
pendingInventoryDeltas
  id                TEXT PRIMARY KEY
  restaurantId      TEXT NOT NULL
  inventoryItemId   TEXT NOT NULL
  delta             REAL              -- exactly one of delta/setAbsolute is non-null
  setAbsolute       REAL
  reason            TEXT NOT NULL
  createdAt         TIMESTAMP NOT NULL DEFAULT NOW()
  syncedAt          TIMESTAMP         -- null until the retry succeeds
```

### Retry

The same `usePeriodicSync()` tick that drives Part 1's pull also sweeps `pending_inventory_deltas` for unsynced rows (oldest first) and retries each against `/inventory/adjust-stock`, marking `syncedAt` on success. This piggybacks on the existing 2-minute cadence rather than introducing a second timer.

### What Part 1's pull does with `quantity`

Since quantity is now server-authoritative, Part 1's pull simply **adopts** whatever quantity comes down for each `inventoryItems` row — no comparison, no last-write-wins, the server's number always wins for this one field. This is what closes the loop: once a delta reaches the server (immediately if online, or via the outbox once connectivity returns), every other device picks up the correct number on its next periodic pull.

## Data model changes

- `pending_inventory_deltas` — new local-only Drizzle table (schema above). No Supabase equivalent; this is purely a client-side retry queue.
- No changes to any existing table's columns. `inventory_items.quantity` keeps its existing column; only its write path changes.
- `syncConfig.ts` gains `getLastPulledAt(restaurantId)` / `setLastPulledAt(restaurantId, date)`, parallel to the existing `getLastSyncedAt`/`setLastSyncedAt`.

## A known risk this codebase has already hit once

Excluding `quantity` from `inventoryItems`' generic push payload only works if the server's generic TABLE_MAP-driven upsert genuinely leaves an omitted column untouched. This app already had a production bug earlier this session where `.upsert()` on a conflict path did **not** do a true partial merge — a column simply absent from the payload was written as `NULL` on the existing row anyway (the staff `pin_hash` incident; fixed by switching that one endpoint to an explicit `.update({...only the provided columns...})` instead of a generic `.upsert()`). The generic sync upsert must be verified against the live database the same way that fix was — reproduce the exact omitted-column case directly against Supabase before trusting it — and if the existing generic TABLE_MAP upsert can't guarantee "omitted means unchanged," the `inventory_items` push path needs the same explicit-`.update()`-with-only-provided-columns treatment that endpoint already got.

## API changes

- `POST /sync` — request gains `lastPulledAt`; response gains `pulledData` and `newPulledAt`. Existing push behavior (and its response shape, `pushedCounts`) is unchanged; both directions happen in the same call.
- `POST /inventory/adjust-stock` — new endpoint, PIN-authenticated the same way `/sync` and `/staff` already are.

## Client changes (high level — exact functions/files belong in the implementation plan)

- `syncService.ts`: `syncNow()` sends `lastPulledAt`, applies `pulledData` after a successful push, stores `newPulledAt`.
- `inventoryService.ts` (`consumeIngredients`/`restoreIngredients`) and `purchaseService.ts` (`recordSupplierPurchase`'s stock bump) and the Inventory item editor's manual-quantity save path all switch from a direct local `quantity` write to the new "apply locally + attempt live + queue on failure" pattern.
- New `usePeriodicSync()` hook, installed once at app root.
- New local table + its Drizzle migration + a matching (client-only, no Supabase table needed) generated migration.

## Testing

- Unit tests for the pull-side conflict comparison (incoming row older than local → skipped; incoming newer or local absent → applied), mirroring the existing `filterChangedSince` test style.
- Unit tests for the outbox retry logic (a queued delta succeeds → marked synced; fails → stays queued and is retried next sweep).
- Manual verification with two real devices (or two paired emulators) against a live account: sell the same item near-simultaneously from two devices while online, confirm the final stock count reflects both sales; disconnect one device, sell an item, reconnect, confirm the queued delta lands and the other device's next pull picks up the correct number; place an order on Device A, confirm it appears in Device B's Reports within one periodic tick (~2 minutes) without any manual action.
