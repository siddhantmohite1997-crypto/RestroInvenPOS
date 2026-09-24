# Bidirectional Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every device converges on the same data — orders, payments, menu, inventory, everything — by adding real pull-from-cloud sync on top of the existing push-only sync, with inventory quantity handled through a separate server-authoritative delta mechanism so concurrent sales on different devices never silently lose stock.

**Architecture:** `POST /sync` gains a second direction in the same request/response (push stays as-is; a new `lastPulledAt`/`pulledData`/`newPulledAt` triple adds pull). A new `usePeriodicSync()` hook calls it every 2 minutes while the app is foregrounded. Inventory quantity is pulled out of the generic mechanism entirely: every stock-changing operation goes through a new `POST /inventory/adjust-stock` endpoint that applies an atomic delta or absolute-set server-side, with a local offline queue so the till is never blocked by a bad connection.

**Tech Stack:** Expo/React Native (SDK 57), TypeScript, Drizzle ORM over local SQLite, Node/Express API, Supabase Postgres, Jest.

**Spec:** `docs/superpowers/specs/2026-09-24-bidirectional-sync-design.md`

## Global Constraints

- Conflict resolution for every table except `inventory_items.quantity` is whole-row last-write-wins by `updated_at` (or `created_at` for append-only tables) — never a merge, never a UI.
- `inventory_items.quantity` is server-authoritative via additive deltas or absolute sets, applied atomically (`quantity = quantity + delta` / `quantity = <value>`), never via a client-sent absolute number riding the generic sync.
- No operation that changes stock may ever block completing a sale/save. The local write always happens immediately; the live server call is best-effort, queued on failure.
- The periodic sync tick (both the generic pull and the inventory-delta outbox retry) is silent on failure — no alert popups. Failures are recorded via the existing `logSyncAttempt`, same as today's manual/scheduled sync.
- Every new local-DB write path that touches more than one table uses a single `db.transaction`, matching this codebase's existing convention (see `recordSupplierPurchase` for the pattern). A live network call is never awaited from inside a `db.transaction` callback — collect what needs to be sent, then make the call after the transaction has committed.

---

## Task 1: `pending_inventory_deltas` local schema

**Files:**
- Modify: `src/db/schema/inventory.ts`

**Interfaces:**
- Produces: `pendingInventoryDeltas` Drizzle table, exported from `@/db/schema`, consumed by Task 10.

- [ ] **Step 1: Add the table**

In `src/db/schema/inventory.ts`, add this at the end of the file:

```ts
/** Local-only outbox for inventory-quantity changes that couldn't reach the server
 * immediately (offline, timeout, server error) -- see adjustStock() in
 * src/features/inventory/stockAdjustmentService.ts. Never part of TABLE_MAP, never
 * pushed or pulled as a regular synced row: this table's whole purpose is retrying
 * against POST /inventory/adjust-stock until it succeeds, then it's done. Exactly one
 * of delta/setAbsolute is set per row, matching adjustStock()'s own two operation
 * shapes (a relative change vs. a stocktake correction). */
export const pendingInventoryDeltas = sqliteTable('pending_inventory_deltas', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  inventoryItemId: text('inventory_item_id')
    .notNull()
    .references(() => inventoryItems.id),
  delta: real('delta'),
  setAbsolute: real('set_absolute'),
  reason: text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});
```

- [ ] **Step 2: Generate the local migration**

Run: `npx drizzle-kit generate`
Expected: a new `src/db/migrations/00NN_<name>.sql` containing `CREATE TABLE pending_inventory_deltas (...)`. Read it and confirm.

- [ ] **Step 3: Register the migration in the runtime migrator**

Read `src/db/migrations/migrations.js` and confirm `drizzle-kit generate` already added the new migration's import and map entry (it does this automatically — this step is a verification, not manual work). Confirm `src/db/migrations/meta/_journal.json` and the new `meta/00NN_snapshot.json` were also created. This exact class of gap (drizzle-kit's own generated files left uncommitted) broke a build earlier this session — do not skip this check.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors beyond the pre-existing unrelated ones (firebase-admin, expo-file-system, Tesseract).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/inventory.ts src/db/migrations/
git commit -m "Add pending_inventory_deltas local outbox table"
```

---

## Task 2: `lastPulledAt` cursor

**Files:**
- Modify: `src/features/sync/syncConfig.ts`

**Interfaces:**
- Produces: `getLastPulledAt(restaurantId): Promise<Date | null>`, `setLastPulledAt(restaurantId, when: Date): Promise<void>` — consumed by Task 8 (syncNow) and Task 9 (restoreFromCloud's post-restore cursor fix).

- [ ] **Step 1: Add the functions**

In `src/features/sync/syncConfig.ts`, add a new key helper alongside the existing ones:

```ts
function lastPulledKey(restaurantId: string) {
  return `pos:sync:lastPulledAt:${restaurantId}`;
}
```

Add these two functions alongside the existing `getLastSyncedAt`/`setLastSyncedAt`:

```ts
export async function getLastPulledAt(restaurantId: string): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(lastPulledKey(restaurantId));
  return raw ? new Date(Number(raw)) : null;
}

export async function setLastPulledAt(restaurantId: string, when: Date): Promise<void> {
  await AsyncStorage.setItem(lastPulledKey(restaurantId), String(when.getTime()));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/sync/syncConfig.ts
git commit -m "Add lastPulledAt cursor storage for incremental pull sync"
```

---

## Task 3: Extract `snakeRowToDrizzle` into a shared module

**Files:**
- Create: `src/features/sync/rowConversion.ts`
- Modify: `src/features/setup/setupService.ts`

**Interfaces:**
- Produces: `snakeRowToDrizzle(table: SQLiteTable, snakeRow: Record<string, unknown>): Record<string, unknown>` — consumed by Task 7 (pull-apply logic), and by `setupService.ts` (unchanged behavior, now imported instead of locally defined).

This function already exists, correctly, inside `setupService.ts` — it's being extracted so Task 7's pull-apply code can reuse it instead of duplicating it, since both restore and pull need to convert the exact same snake_case-Postgres-row-to-camelCase-Drizzle-row shape.

- [ ] **Step 1: Create the shared file**

Create `src/features/sync/rowConversion.ts`:

```ts
import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

/** Converts one Postgres row (snake_case keys, as Supabase returns them) into the shape
 * Drizzle expects for this table (camelCase keys, proper JS types) by walking the table's own
 * column definitions rather than hardcoding a per-table field map. A cloud column with no local
 * counterpart (e.g. restaurant_id stamped onto child tables purely for cloud-side RLS) is
 * silently skipped; a local column absent from the cloud row (e.g. one added after this
 * restaurant was first synced) is left for its own `.default(...)` to fill in. */
export function snakeRowToDrizzle(table: SQLiteTable, snakeRow: Record<string, unknown>): Record<string, unknown> {
  const columns = getTableColumns(table);
  const result: Record<string, unknown> = {};
  for (const [camelKey, column] of Object.entries(columns)) {
    const dbName = column.name;
    if (!(dbName in snakeRow)) continue;
    const raw = snakeRow[dbName];
    if (raw === null || raw === undefined) {
      result[camelKey] = null;
    } else if (column.dataType === 'date') {
      result[camelKey] = new Date(raw as string | number);
    } else if (column.dataType === 'boolean') {
      result[camelKey] = Boolean(raw);
    } else {
      result[camelKey] = raw;
    }
  }
  return result;
}
```

- [ ] **Step 2: Update `setupService.ts` to import it instead of defining it locally**

In `src/features/setup/setupService.ts`, remove the local `snakeRowToDrizzle` function definition (the full function, currently reading `getTableColumns`/`SQLiteTable` imports and the function body — everything from `/** Converts one Postgres row...` through its closing `}`).

Add this import near the top of the file, alongside the other `@/` imports:
```ts
import { snakeRowToDrizzle } from '@/features/sync/rowConversion';
```

Remove `getTableColumns` from the `drizzle-orm` import line at the top of the file if it's no longer used elsewhere in `setupService.ts` (check first — it should only have been used inside the function just removed).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `setupService.ts`'s `restoreFromCloud` must still compile and behave identically — this step is a pure extraction, no behavior change.

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all existing suites still pass (this extraction touches no test-covered logic's behavior, only its location).

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/rowConversion.ts src/features/setup/setupService.ts
git commit -m "Extract snakeRowToDrizzle into a shared module for reuse by pull sync"
```

---

## Task 4: API — pull logic in `/sync`

**Files:**
- Modify: `api/src/index.ts`

**Interfaces:**
- Consumes: the existing `TABLE_MAP` (already in this file).
- Produces: `/sync`'s response gains `pulledData: Record<string, unknown[]>` and `newPulledAt: string`; its request accepts `lastPulledAt: string | null`. Consumed by Task 8 (client's `syncNow()`).

- [ ] **Step 1: Add the pull table configuration**

In `api/src/index.ts`, add this near `TABLE_MAP` (right after it):

```ts
// Which timestamp column each table's pull query filters on. Tables never updated after
// insert (append-only logs) use created_at; everything else uses updated_at. orders is handled
// specially below (its own updated_at decides whether to include it, but its four child tables
// are never filtered individually -- they're always resent in full for any order that qualifies,
// matching how the push side already treats an order's children as "all-or-nothing" rather than
// diffing them separately). menuItemModifierGroups has no updated_at column (composite-keyed,
// never edited after creation -- only added or removed) so it's append-only too, filtered on
// created_at like the others in this list.
const APPEND_ONLY_TABLES = new Set([
  'inventoryPurchases',
  'auditLogs',
  'purchases',
  'menuItemModifierGroups',
  'comboDealItems',
  'taxComponents',
]);

// orders' four child tables are pulled alongside their parent order, never independently --
// see the /sync handler's pull section.
const ORDER_CHILD_TABLES = ['orderItems', 'orderItemModifiers', 'discounts', 'payments'] as const;
```

- [ ] **Step 2: Add the pull query helper**

Add this function right after `fetchAllRows` (which already exists in this file, above the `/restore` handler):

```ts
/** Rows changed since `sinceIso` (exclusive) for one table -- the pull-side mirror of
 * fetchAllRows, filtered by whichever timestamp column that table uses for change detection.
 * `sinceIso === null` means "never pulled before", so every row for this restaurant counts as
 * changed, matching filterChangedSince's client-side "null means everything" convention. */
async function fetchChangedRows(
  pgTable: string,
  restaurantId: string,
  timestampColumn: 'updated_at' | 'created_at',
  sinceIso: string | null,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    let query = supabase.from(pgTable).select('*').eq('restaurant_id', restaurantId);
    if (sinceIso !== null) {
      query = query.gt(timestampColumn, sinceIso);
    }
    const { data, error } = await query.range(from, from + RESTORE_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < RESTORE_PAGE_SIZE) break;
    from += RESTORE_PAGE_SIZE;
  }
  return rows;
}
```

- [ ] **Step 3: Add pull to the `/sync` handler**

In `api/src/index.ts`, the `/sync` handler currently reads (relevant excerpt):

```ts
app.post('/sync', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin, syncData, checkOnly } = req.body as SyncRequest & {
      checkOnly?: boolean;
    };
```

Change this destructuring to also read `lastPulledAt`:

```ts
app.post('/sync', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin, syncData, checkOnly, lastPulledAt } = req.body as SyncRequest & {
      checkOnly?: boolean;
      lastPulledAt?: string | null;
    };
```

Right after the existing push loop's closing (immediately after the `for (const [jsKey, { table: pgTable, conflictTarget }] of Object.entries(TABLE_MAP)) { ... }` loop, and before the existing `// Update last_synced_at` comment), capture the server's clock and run the pull:

```ts
    // Captured before running any pull queries -- any row written concurrently with this
    // request either lands in this response (if its timestamp query already covers it) or the
    // next one (since its timestamp will be > this captured moment either way). Never both
    // included and later missed.
    const serverNow = new Date();

    const pulledData: Record<string, unknown[]> = {};
    const sinceIso = lastPulledAt ?? null;

    for (const [jsKey, { table: pgTable }] of Object.entries(TABLE_MAP)) {
      if (jsKey === 'orders') continue; // handled specially below, with its children
      if ((ORDER_CHILD_TABLES as readonly string[]).includes(jsKey)) continue;
      const timestampColumn = APPEND_ONLY_TABLES.has(jsKey) ? 'created_at' : 'updated_at';
      pulledData[jsKey] = await fetchChangedRows(pgTable, restaurantId, timestampColumn, sinceIso);
    }

    // Orders: find which orders changed, then pull ALL current rows of their four child tables
    // for exactly those orders -- never filtered by the children's own timestamps, matching how
    // the push side already resends an order's children in full whenever the order itself is
    // dirty, rather than diffing them individually.
    const changedOrders = await fetchChangedRows('orders', restaurantId, 'updated_at', sinceIso);
    pulledData.orders = changedOrders;
    const changedOrderIds = changedOrders.map((o) => o.id as string);

    for (const jsKey of ORDER_CHILD_TABLES) {
      const pgTable = TABLE_MAP[jsKey].table;
      if (changedOrderIds.length === 0) {
        pulledData[jsKey] = [];
        continue;
      }
      const { data, error } = await supabase.from(pgTable).select('*').in('order_id', changedOrderIds);
      if (error) throw error;
      pulledData[jsKey] = data ?? [];
    }

    const newPulledAt = serverNow.toISOString();
```

Finally, add `pulledData` and `newPulledAt` to the response object. The existing response reads:

```ts
    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      pushedCounts,
    } as SyncResponse);
```

Change it to:

```ts
    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      pushedCounts,
      pulledData,
      newPulledAt,
    });
```

(Drop the `as SyncResponse` cast on this line, since `SyncResponse` doesn't yet declare the two new fields and this plan isn't asking you to widen that interface — the response object's shape is correct at the call site either way; TypeScript will infer it. If you'd rather keep the cast for documentation value, widen the `SyncResponse` interface near the top of the file to include `pulledData: Record<string, unknown[]>` and `newPulledAt: string` instead of dropping the cast — either is fine, just pick one and confirm `tsc` is clean.)

- [ ] **Step 4: Typecheck the API**

Run: `cd api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification against the live API**

The API needs to be deployed for this check (or run locally — `cd api && npm run dev` if this project has that script; check `api/package.json`). Once running, `curl` it directly:

```bash
curl -s -X POST https://restroinvenpos-production.up.railway.app/sync \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"quality-bites-fc3c09","pin":"<a real staff PIN>","syncData":{},"lastPulledAt":null}'
```

Expected: a JSON response with `pulledData` containing every table's current rows for this restaurant (since `lastPulledAt: null` means "everything"), including `pulledData.orders` with entries, and `newPulledAt` set to a recent ISO timestamp. This is the same real restaurant used to diagnose the original bug — a successful response with real order data in `pulledData.orders` directly confirms the fix's core mechanism works end-to-end against production data.

**Do not deploy this to Railway yet** — deployment happens once as a single step after every API-touching task in this plan is done (Task 4, Task 6, Task 7 all touch `api/src/index.ts`), to avoid three separate partial deploys. Run this verification against a local `npm run dev` instance instead if one is available, or note in your report that live verification is deferred to the plan's final deploy step.

- [ ] **Step 6: Commit**

```bash
git add api/src/index.ts
git commit -m "Add pull-from-cloud to /sync alongside the existing push"
```

---

## Task 5: API — stop pushing `inventory_items.quantity` through the generic upsert

**Files:**
- Modify: `api/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `/sync` push loop's behavior for `inventoryItems` changes — no longer accepts a client-sent `quantity` for a row that already exists server-side.

This closes the exact gap flagged in the spec's "known risk" section: the generic push upsert would otherwise silently overwrite the server's authoritative quantity with a client's stale local number (or, since `quantity` is `NOT NULL`, outright fail with a constraint violation on a naive omit-the-field attempt — either way, wrong). This mirrors the `/staff` endpoint's existing `if (!pin) { ...explicit update... } else { ...upsert... }` pattern exactly, keyed on whether the row already exists server-side instead of whether a PIN was given.

- [ ] **Step 1: Special-case `inventoryItems` in the push loop**

In `api/src/index.ts`, the push loop currently reads:

```ts
    for (const [jsKey, { table: pgTable, conflictTarget }] of Object.entries(TABLE_MAP)) {
      const rows = (syncData[jsKey] as Record<string, unknown>[]) || [];
      pushedCounts[jsKey] = 0;
      if (rows.length === 0) continue;

      const snakeRows = rows.map((row) => {
        // Remove changedAt (local diffing field, not a real column)
        const { changedAt: _changedAt, ...cleanRow } = row;
        const snakeRow = rowToSnakeCase(cleanRow);

        // Stamp restaurant_id for filtering — except on the restaurants table itself, which
        // IS the restaurant record and has no such column (it doesn't reference itself).
        // Every other synced table gets it uniformly, including junction tables that don't
        // have it locally, for RLS/isolation defense-in-depth.
        return jsKey === 'restaurants' ? snakeRow : { ...snakeRow, restaurant_id: restaurantId };
      });

      for (let i = 0; i < snakeRows.length; i += SYNC_BATCH_SIZE) {
        const chunk = snakeRows.slice(i, i + SYNC_BATCH_SIZE);
        const { error } = await supabase.from(pgTable).upsert(chunk, {
          onConflict: conflictTarget,
        });

        if (error) {
          console.error(`Error upserting ${pgTable}:`, error);
          throw error;
        }
      }

      pushedCounts[jsKey] = rows.length;
    }
```

Replace the entire loop body's per-table handling with a version that special-cases `inventoryItems`:

```ts
    for (const [jsKey, { table: pgTable, conflictTarget }] of Object.entries(TABLE_MAP)) {
      const rows = (syncData[jsKey] as Record<string, unknown>[]) || [];
      pushedCounts[jsKey] = 0;
      if (rows.length === 0) continue;

      const snakeRows = rows.map((row) => {
        // Remove changedAt (local diffing field, not a real column)
        const { changedAt: _changedAt, ...cleanRow } = row;
        const snakeRow = rowToSnakeCase(cleanRow);

        // Stamp restaurant_id for filtering — except on the restaurants table itself, which
        // IS the restaurant record and has no such column (it doesn't reference itself).
        // Every other synced table gets it uniformly, including junction tables that don't
        // have it locally, for RLS/isolation defense-in-depth.
        return jsKey === 'restaurants' ? snakeRow : { ...snakeRow, restaurant_id: restaurantId };
      });

      if (jsKey === 'inventoryItems') {
        // quantity is server-authoritative (see POST /inventory/adjust-stock) -- a plain
        // upsert here would either silently overwrite a more current server value with a
        // stale local one, or fail outright on the NOT NULL constraint if quantity were simply
        // omitted from an UPDATE payload (Supabase's upsert() does not do a true partial merge
        // on conflict -- confirmed directly against this database during the staff pin_hash
        // incident earlier this session). Existing rows get an explicit update that never
        // mentions quantity; only a genuinely new row (first time this id has ever reached the
        // server) gets its quantity inserted, establishing the starting value adjustStock()
        // will apply deltas against from then on.
        const existingIds = new Set<string>();
        for (let i = 0; i < snakeRows.length; i += SYNC_BATCH_SIZE) {
          const idsChunk = snakeRows.slice(i, i + SYNC_BATCH_SIZE).map((r) => r.id as string);
          const { data: existingRows, error: lookupError } = await supabase
            .from(pgTable)
            .select('id')
            .in('id', idsChunk);
          if (lookupError) throw lookupError;
          for (const row of existingRows ?? []) existingIds.add(row.id as string);
        }

        const newRows = snakeRows.filter((r) => !existingIds.has(r.id as string));
        const updateRows = snakeRows.filter((r) => existingIds.has(r.id as string));

        for (let i = 0; i < newRows.length; i += SYNC_BATCH_SIZE) {
          const chunk = newRows.slice(i, i + SYNC_BATCH_SIZE);
          const { error } = await supabase.from(pgTable).upsert(chunk, { onConflict: conflictTarget });
          if (error) {
            console.error(`Error inserting new ${pgTable}:`, error);
            throw error;
          }
        }

        for (const row of updateRows) {
          const { quantity: _quantity, id, ...updateFields } = row;
          const { error } = await supabase.from(pgTable).update(updateFields).eq('id', id as string);
          if (error) {
            console.error(`Error updating ${pgTable} ${String(id)}:`, error);
            throw error;
          }
        }

        pushedCounts[jsKey] = rows.length;
        continue;
      }

      for (let i = 0; i < snakeRows.length; i += SYNC_BATCH_SIZE) {
        const chunk = snakeRows.slice(i, i + SYNC_BATCH_SIZE);
        const { error } = await supabase.from(pgTable).upsert(chunk, {
          onConflict: conflictTarget,
        });

        if (error) {
          console.error(`Error upserting ${pgTable}:`, error);
          throw error;
        }
      }

      pushedCounts[jsKey] = rows.length;
    }
```

- [ ] **Step 2: Typecheck the API**

Run: `cd api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify directly against the live database**

This is the exact class of bug that already bit this codebase once — verify it for real, the same way that earlier fix was verified. Write a small one-off Node script (in your scratchpad, not committed) using `@supabase/supabase-js` with the service-role key (available via `railway variables --kv` in this project) that:
1. Reads a real `inventory_items` row's current `quantity` for restaurant `quality-bites-fc3c09` (or any restaurant with at least one inventory item).
2. Calls the same update path this task just added (an explicit `.update({...fields except quantity...}).eq('id', ...)`) with a payload that changes some OTHER field (e.g. `low_stock_threshold`).
3. Re-reads the row and confirms `quantity` is unchanged while the other field updated.

Report the exact before/after quantity values in your task report as evidence, not just "it passed."

- [ ] **Step 4: Commit**

```bash
git add api/src/index.ts
git commit -m "Stop pushing inventory quantity through the generic upsert"
```

---

## Task 6: API — `POST /inventory/adjust-stock`

**Files:**
- Modify: `api/src/index.ts`

**Interfaces:**
- Produces: `POST /inventory/adjust-stock` — request `{ restaurantId, pin, inventoryItemId, delta?, setAbsolute?, reason }`, response `{ quantity: number }`. Consumed by Task 10's `adjustStock()`.

- [ ] **Step 1: Add the endpoint**

In `api/src/index.ts`, add this new route, placed after the `/staff` endpoint and before the `// SYNC ENDPOINT` section comment:

```ts
// ============================================================================
// INVENTORY ADJUST-STOCK ENDPOINT
// ============================================================================

/**
 * Applies an atomic, server-authoritative change to one inventory item's quantity -- either a
 * relative delta (a sale, a restock) or an absolute set (a stocktake correction). Never accepts
 * a client's snapshot of the current quantity: the whole point is that two devices calling this
 * concurrently for the same item both land correctly regardless of arrival order, which a
 * client-computed "new total" could never guarantee. Exactly one of delta/setAbsolute must be
 * provided. See src/features/inventory/stockAdjustmentService.ts for the client side (always
 * applies locally first, calls this live when online, queues it otherwise).
 */
app.post('/inventory/adjust-stock', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin, inventoryItemId, delta, setAbsolute, reason } = req.body as {
      restaurantId?: string;
      pin?: string;
      inventoryItemId?: string;
      delta?: number;
      setAbsolute?: number;
      reason?: string;
    };

    if (!restaurantId || !pin || !inventoryItemId || !reason) {
      return res
        .status(400)
        .json({ error: 'restaurantId, pin, inventoryItemId, and reason required' });
    }
    if ((delta === undefined) === (setAbsolute === undefined)) {
      return res.status(400).json({ error: 'Exactly one of delta or setAbsolute is required' });
    }

    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.reason || 'Authentication failed' });
    }

    if (setAbsolute !== undefined) {
      const { data, error } = await supabase
        .from('inventory_items')
        .update({ quantity: setAbsolute, updated_at: new Date().toISOString() })
        .eq('id', inventoryItemId)
        .eq('restaurant_id', restaurantId)
        .select('quantity')
        .single();
      if (error) {
        console.error(`adjust-stock (set) failed for ${inventoryItemId}:`, error);
        return res.status(500).json({ error: error.message });
      }
      return res.json({ quantity: data.quantity });
    }

    // Postgres computes the new value from its own current row in one atomic statement --
    // two concurrent calls for the same item both apply correctly regardless of which the
    // database processes first, since neither ever reads-then-writes a stale snapshot.
    const { data, error } = await supabase.rpc('adjust_inventory_quantity', {
      p_inventory_item_id: inventoryItemId,
      p_restaurant_id: restaurantId,
      p_delta: delta,
    });
    if (error) {
      console.error(`adjust-stock (delta) failed for ${inventoryItemId}:`, error);
      return res.status(500).json({ error: error.message });
    }
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    res.json({ quantity: data[0].new_quantity });
  } catch (err) {
    console.error('Adjust-stock error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Adjust stock failed',
    });
  }
});
```

- [ ] **Step 2: Add the Postgres function this endpoint calls**

A plain `.update({ quantity: sql\`quantity + delta\` })` isn't expressible through the Supabase JS client for an atomic increment — it needs a database-side function. Create `supabase/migrations/013_adjust_inventory_quantity.sql`:

```sql
-- Atomic, server-side delta application for inventory quantity -- see POST
-- /inventory/adjust-stock in api/src/index.ts, the only caller. Runs entirely inside Postgres
-- in one statement so two concurrent calls for the same item can never race each other into a
-- lost update the way a read-then-write from application code could.
CREATE OR REPLACE FUNCTION adjust_inventory_quantity(
  p_inventory_item_id TEXT,
  p_restaurant_id TEXT,
  p_delta NUMERIC
)
RETURNS TABLE(new_quantity NUMERIC) AS $$
BEGIN
  RETURN QUERY
  UPDATE inventory_items
  SET quantity = ROUND((quantity + p_delta)::numeric, 3),
      updated_at = NOW()
  WHERE id = p_inventory_item_id AND restaurant_id = p_restaurant_id
  RETURNING inventory_items.quantity;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Typecheck the API**

Run: `cd api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Flag the manual production step**

This migration is not auto-applied. Note in your task report that `supabase/migrations/013_adjust_inventory_quantity.sql` needs to be run against the live database before this endpoint can work — same one-off-run process as every migration before it this session.

- [ ] **Step 5: Commit**

```bash
git add api/src/index.ts supabase/migrations/013_adjust_inventory_quantity.sql
git commit -m "Add POST /inventory/adjust-stock for atomic server-side quantity changes"
```

---

## Task 7: Client — apply pulled data to local SQLite

**Files:**
- Create: `src/features/sync/pullSync.ts`
- Test: `__tests__/pullSync.test.ts`

**Interfaces:**
- Consumes: `snakeRowToDrizzle` (Task 3).
- Produces: `applyPulledData(tx, pulledData: Record<string, unknown[]>): Promise<void>` and the pure comparison helper `shouldApplyIncoming(localUpdatedAt: Date | null, incomingUpdatedAt: Date): boolean` (exported separately so it's unit-testable without a database) — consumed by Task 8's `syncNow()`.

- [ ] **Step 1: Write the failing test for the comparison rule**

Create `__tests__/pullSync.test.ts`:

```ts
import { shouldApplyIncoming } from '@/features/sync/pullSync';

describe('shouldApplyIncoming', () => {
  it('applies when the row does not exist locally yet', () => {
    expect(shouldApplyIncoming(null, new Date('2026-01-01'))).toBe(true);
  });

  it('applies when the incoming row is newer than the local one', () => {
    const local = new Date('2026-01-01T00:00:00Z');
    const incoming = new Date('2026-01-01T00:00:01Z');
    expect(shouldApplyIncoming(local, incoming)).toBe(true);
  });

  it('skips when the local row is newer than the incoming one', () => {
    const local = new Date('2026-01-01T00:00:01Z');
    const incoming = new Date('2026-01-01T00:00:00Z');
    expect(shouldApplyIncoming(local, incoming)).toBe(false);
  });

  it('skips when local and incoming are exactly equal (nothing to change)', () => {
    const same = new Date('2026-01-01T00:00:00Z');
    expect(shouldApplyIncoming(same, same)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/pullSync.test.ts`
Expected: FAIL — `shouldApplyIncoming is not a function` (module doesn't exist yet).

- [ ] **Step 3: Implement `pullSync.ts`**

Create `src/features/sync/pullSync.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { db as Database } from '@/db/client';
import {
  categories,
  taxRules,
  taxComponents,
  menuItems,
  modifierGroups,
  modifiers,
  menuItemModifierGroups,
  comboDeals,
  comboDealItems,
  suppliers,
  purchases,
  inventoryItems,
  inventoryPurchases,
  recipeIngredients,
  diningTables,
  orders,
  orderItems,
  orderItemModifiers,
  discounts,
  payments,
  auditLogs,
  restaurants,
} from '@/db/schema';
import { snakeRowToDrizzle } from './rowConversion';

/** true if the incoming row should replace what's stored locally: nothing stored yet, or the
 * incoming version is strictly newer. Equal or older means the local device's own unpushed
 * edit (or a genuinely identical snapshot) wins -- pulling an equal-or-older cloud copy must
 * never regress a local change this device hasn't had a chance to push yet. */
export function shouldApplyIncoming(localUpdatedAt: Date | null, incomingUpdatedAt: Date): boolean {
  if (localUpdatedAt === null) return true;
  return incomingUpdatedAt.getTime() > localUpdatedAt.getTime();
}

type Tx = Parameters<Parameters<typeof Database.transaction>[0]>[0];

/** Tables that resolve conflicts by plain last-write-wins on updatedAt, upserting via
 * onConflictDoUpdate — every column except the row's own id. Order matches TABLE_MAP's
 * parent-before-child FK-safe order (restaurants and orders are handled separately below). */
const LAST_WRITE_WINS_TABLES: { key: string; table: SQLiteTable }[] = [
  { key: 'categories', table: categories },
  { key: 'taxRules', table: taxRules },
  { key: 'menuItems', table: menuItems },
  { key: 'modifierGroups', table: modifierGroups },
  { key: 'modifiers', table: modifiers },
  { key: 'comboDeals', table: comboDeals },
  { key: 'suppliers', table: suppliers },
  { key: 'diningTables', table: diningTables },
];

/** Append-only: never updated after insert, so there's no conflict to resolve — insert if this
 * device doesn't already have the row, otherwise leave the existing one alone. */
const APPEND_ONLY_TABLES: { key: string; table: SQLiteTable }[] = [
  { key: 'taxComponents', table: taxComponents },
  { key: 'menuItemModifierGroups', table: menuItemModifierGroups },
  { key: 'comboDealItems', table: comboDealItems },
  { key: 'purchases', table: purchases },
  { key: 'inventoryPurchases', table: inventoryPurchases },
  { key: 'recipeIngredients', table: recipeIngredients },
  { key: 'auditLogs', table: auditLogs },
];

const ORDER_CHILD_TABLES: { key: string; table: SQLiteTable }[] = [
  { key: 'orderItems', table: orderItems },
  { key: 'orderItemModifiers', table: orderItemModifiers },
  { key: 'discounts', table: discounts },
  { key: 'payments', table: payments },
];

async function applyLastWriteWinsRow(tx: Tx, table: SQLiteTable, row: Record<string, unknown>): Promise<void> {
  const converted = snakeRowToDrizzle(table, row);
  const id = converted.id as string;
  const incomingUpdatedAt = converted.updatedAt as Date;

  const existing = await tx
    .select({ updatedAt: (table as unknown as { updatedAt: unknown }).updatedAt })
    .from(table)
    .where(eq((table as unknown as { id: unknown }).id as never, id as never))
    .limit(1);

  const localUpdatedAt = existing.length > 0 ? (existing[0].updatedAt as Date) : null;
  if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) return;

  const { id: _id, ...setFields } = converted;
  await tx
    .insert(table)
    .values(converted)
    .onConflictDoUpdate({ target: (table as unknown as { id: unknown }).id as never, set: setFields });
}

async function applyAppendOnlyRow(tx: Tx, table: SQLiteTable, row: Record<string, unknown>): Promise<void> {
  const converted = snakeRowToDrizzle(table, row);
  await tx.insert(table).values(converted).onConflictDoNothing();
}

/** Applies one /sync response's pulledData to local SQLite, table by table, inside the
 * transaction the caller already has open. restaurants (a singleton row) and inventoryItems
 * (quantity is special-cased -- see below) are handled separately from the generic
 * last-write-wins loop; orders and its four child tables are handled together, since a child
 * row is only ever meaningful alongside the order version it belongs to. */
export async function applyPulledData(tx: Tx, pulledData: Record<string, unknown[]>): Promise<void> {
  const restaurantRows = pulledData.restaurants ?? [];
  for (const row of restaurantRows) {
    await applyLastWriteWinsRow(tx, restaurants, row as Record<string, unknown>);
  }

  for (const { key, table } of LAST_WRITE_WINS_TABLES) {
    for (const row of pulledData[key] ?? []) {
      await applyLastWriteWinsRow(tx, table, row as Record<string, unknown>);
    }
  }

  // inventoryItems: every column except quantity follows the normal last-write-wins rule;
  // quantity itself is always adopted from the server, since POST /inventory/adjust-stock has
  // made the server the sole authority for it (see the spec's Part 2).
  for (const row of pulledData.inventoryItems ?? []) {
    const converted = snakeRowToDrizzle(inventoryItems, row as Record<string, unknown>);
    const id = converted.id as string;
    const incomingUpdatedAt = converted.updatedAt as Date;

    const existing = await tx
      .select({ updatedAt: inventoryItems.updatedAt, quantity: inventoryItems.quantity })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(inventoryItems).values(converted).onConflictDoNothing();
      continue;
    }

    const localUpdatedAt = existing[0].updatedAt;
    // quantity always adopts the server's value regardless of the last-write-wins outcome for
    // every other column -- computed once, applied whichever branch below runs.
    const quantity = converted.quantity;

    if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) {
      // Local edit to some OTHER field (name, category, ...) is newer and wins for those
      // columns, but quantity still adopts the server's authoritative number.
      await tx.update(inventoryItems).set({ quantity }).where(eq(inventoryItems.id, id));
      continue;
    }

    const { id: _id, ...setFields } = converted;
    await tx.update(inventoryItems).set(setFields).where(eq(inventoryItems.id, id));
  }

  for (const { key, table } of APPEND_ONLY_TABLES) {
    for (const row of pulledData[key] ?? []) {
      await applyAppendOnlyRow(tx, table, row as Record<string, unknown>);
    }
  }

  // orders: last-write-wins decides whether to apply each order; if it applies, ALL of that
  // order's current children replace whatever this device has for it, matching how the push
  // side already resends an order's children in full whenever the order itself is dirty rather
  // than diffing them individually.
  const orderRows = pulledData.orders ?? [];
  const appliedOrderIds = new Set<string>();
  for (const row of orderRows) {
    const converted = snakeRowToDrizzle(orders, row as Record<string, unknown>);
    const id = converted.id as string;
    const incomingUpdatedAt = converted.updatedAt as Date;

    const existing = await tx.select({ updatedAt: orders.updatedAt }).from(orders).where(eq(orders.id, id)).limit(1);
    const localUpdatedAt = existing.length > 0 ? existing[0].updatedAt : null;
    if (!shouldApplyIncoming(localUpdatedAt, incomingUpdatedAt)) continue;

    const { id: _id, ...setFields } = converted;
    await tx.insert(orders).values(converted).onConflictDoUpdate({ target: orders.id, set: setFields });
    appliedOrderIds.add(id);
  }

  for (const { key, table } of ORDER_CHILD_TABLES) {
    for (const row of pulledData[key] ?? []) {
      const converted = snakeRowToDrizzle(table, row as Record<string, unknown>);
      const orderId = converted.orderId as string;
      if (!appliedOrderIds.has(orderId)) continue;
      const { id: _id, ...setFields } = converted;
      await tx
        .insert(table)
        .values(converted)
        .onConflictDoUpdate({ target: (table as unknown as { id: unknown }).id as never, set: setFields });
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/pullSync.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. This file leans on some `as never`/`as unknown as {...}` casts to keep the per-table loops generic across Drizzle's strongly-typed table objects — if any of these don't compile as written, the fix is a more specific cast at that exact spot, not a redesign; Drizzle's typed query builder resists true generic table operations, and this file's whole point is being the one place that works around that so the per-table lists above can stay short and data-driven.

- [ ] **Step 6: Commit**

```bash
git add src/features/sync/pullSync.ts __tests__/pullSync.test.ts
git commit -m "Add applyPulledData for incremental pull-sync conflict resolution"
```

---

## Task 8: Client — wire pull into `syncNow()`, fix the post-restore cursor

**Files:**
- Modify: `src/features/sync/syncService.ts`
- Modify: `src/features/setup/setupService.ts`

**Interfaces:**
- Consumes: `getLastPulledAt`/`setLastPulledAt` (Task 2), `applyPulledData` (Task 7).
- Produces: `syncNow()` now performs both directions; `restoreFromCloud()` seeds `lastPulledAt` so the next periodic sync doesn't redundantly re-pull everything `/restore` just delivered.

- [ ] **Step 1: Send `lastPulledAt` and receive the pull response**

In `src/features/sync/syncService.ts`, update `callSupabaseSync`'s signature and body. It currently reads:

```ts
async function callSupabaseSync(
  restaurantId: string,
  pin: string,
  syncData: Record<string, unknown>,
): Promise<{ pushedCounts: Record<string, number> }> {
  const response = await fetch(`${getApiUrl()}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      pin,
      syncData,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${await readErrorMessage(response)}`);
  }

  const result = (await response.json()) as { pushedCounts: Record<string, number> };
  return result;
}
```

Replace with:

```ts
async function callSupabaseSync(
  restaurantId: string,
  pin: string,
  syncData: Record<string, unknown>,
  lastPulledAt: Date | null,
): Promise<{
  pushedCounts: Record<string, number>;
  pulledData: Record<string, unknown[]>;
  newPulledAt: string;
}> {
  const response = await fetch(`${getApiUrl()}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      pin,
      syncData,
      lastPulledAt: lastPulledAt ? lastPulledAt.toISOString() : null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${await readErrorMessage(response)}`);
  }

  const result = (await response.json()) as {
    pushedCounts: Record<string, number>;
    pulledData: Record<string, unknown[]>;
    newPulledAt: string;
  };
  return result;
}
```

- [ ] **Step 2: Apply the pull result inside `syncNowInternal`**

In `src/features/sync/syncService.ts`, the imports at the top need `getLastPulledAt`/`setLastPulledAt` and `applyPulledData`:

```ts
import { getLastSyncedAt, setLastSyncedAt, getLastPulledAt, setLastPulledAt } from './syncConfig';
```
(this replaces the existing `import { getLastSyncedAt, setLastSyncedAt } from './syncConfig';` line)

```ts
import { applyPulledData } from './pullSync';
```
(new import, added alongside the others)

`syncNowInternal` currently ends with:

```ts
  // Call Supabase API to sync (server handles all PostgreSQL writes)
  const result = await callSupabaseSync(restaurantId, pin, syncData);

  const syncedAt = new Date();
  await setLastSyncedAt(restaurantId, syncedAt);

  return { pushedCounts: result.pushedCounts, syncedAt };
}
```

Replace with:

```ts
  const lastPulledAt = await getLastPulledAt(restaurantId);

  // Call Supabase API to sync (server handles all PostgreSQL writes for the push half)
  const result = await callSupabaseSync(restaurantId, pin, syncData, lastPulledAt);

  await db.transaction(async (tx) => {
    await applyPulledData(tx, result.pulledData);
  });
  await setLastPulledAt(restaurantId, new Date(result.newPulledAt));

  const syncedAt = new Date();
  await setLastSyncedAt(restaurantId, syncedAt);

  return { pushedCounts: result.pushedCounts, syncedAt };
}
```

`db` is already imported in this file (`import { db } from '@/db/client';`) — confirm this before making the edit; if for some reason it isn't, add it.

- [ ] **Step 3: Seed `lastPulledAt` after a successful restore**

In `src/features/setup/setupService.ts`, add the import:

```ts
import { setLastPulledAt } from '@/features/sync/syncConfig';
```

`restoreFromCloud` currently ends with:

```ts
    for (const { key, table } of RESTORE_TABLE_ORDER) {
      const rows = data[key] ?? [];
      if (rows.length === 0) continue;
      tablesRestored += 1;
      for (let i = 0; i < rows.length; i += RESTORE_INSERT_CHUNK_SIZE) {
        const chunk = rows
          .slice(i, i + RESTORE_INSERT_CHUNK_SIZE)
          .map((row) => snakeRowToDrizzle(table, row));
        await tx.insert(table).values(chunk).onConflictDoNothing();
      }
      rowsRestored += rows.length;
    }
  });

  return { tablesRestored, rowsRestored };
}
```

Add the cursor seed right after the transaction completes, before the `return`:

```ts
    for (const { key, table } of RESTORE_TABLE_ORDER) {
      const rows = data[key] ?? [];
      if (rows.length === 0) continue;
      tablesRestored += 1;
      for (let i = 0; i < rows.length; i += RESTORE_INSERT_CHUNK_SIZE) {
        const chunk = rows
          .slice(i, i + RESTORE_INSERT_CHUNK_SIZE)
          .map((row) => snakeRowToDrizzle(table, row));
        await tx.insert(table).values(chunk).onConflictDoNothing();
      }
      rowsRestored += rows.length;
    }
  });

  // This device just received everything /restore has -- without this, its first periodic
  // sync would pull the exact same full history all over again (lastPulledAt still null means
  // "never pulled", per shouldApplyIncoming's convention). Idempotent either way (pullSync's
  // onConflictDoUpdate/onConflictDoNothing handle a duplicate re-delivery safely), just wasteful.
  await setLastPulledAt(restaurantId, new Date());

  return { tablesRestored, rowsRestored };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: all suites pass.

- [ ] **Step 6: Manual verification**

Requires the API deployed with Tasks 4-6's changes live (or running locally). Check Metro is reachable (`curl -s http://localhost:8081/status`) on the `resto_test` emulator set up earlier this session; restart via `npx expo run:android` if not. Log in as Owner (PIN 1234). Tap Settings → Sync → "Sync Now". Confirm it completes without error. This is a smoke test of the wiring (does the new request/response shape work end-to-end from the app), not yet proof that cross-device data appears — that's Task 9's periodic-tick verification once real data exists to pull.

- [ ] **Step 7: Commit**

```bash
git add src/features/sync/syncService.ts src/features/setup/setupService.ts
git commit -m "Wire pull sync into syncNow(); seed lastPulledAt after restore"
```

---

## Task 9: Client — `usePeriodicSync()` hook

**Files:**
- Create: `src/features/sync/usePeriodicSync.ts`
- Modify: `app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `syncNow` (existing, `@/features/sync/syncService`).
- Produces: a hook with no return value, installed once at app root — consumed by Task 11 (also sweeps the inventory-delta outbox on the same tick).

- [ ] **Step 1: Write the hook**

Create `src/features/sync/usePeriodicSync.ts`:

```ts
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { syncNow } from './syncService';
import { logSyncAttempt } from './syncLogService';

const PERIODIC_SYNC_INTERVAL_MS = 120_000;

/** Runs a combined push+pull sync every 2 minutes while the app is in the foreground and a
 * restaurant/PIN is active -- this is what makes another device's changes (a bill someone else
 * just punched, a stock delta someone else's device queued while offline) show up here without
 * anyone tapping "Sync Now". Pauses entirely while backgrounded, matching normal mobile
 * battery/data hygiene -- no point polling a screen nobody's looking at. Silent on failure
 * (no alert popups every 2 minutes on a bad connection); failures are still recorded via
 * logSyncAttempt, same as every other sync path, so Settings > Sync's history still shows them. */
export function usePeriodicSync() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurant = useAuthStore((s) => s.restaurant);
  const currentPin = useAuthStore((s) => s.currentPin);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!currentUser || !restaurant || !currentPin) return;

    const restaurantId = restaurant.id;
    const pin = currentPin;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (appStateRef.current !== 'active') return;
      syncNow(restaurantId, pin, 'auto').catch((err) => {
        logSyncAttempt({
          restaurantId,
          triggeredBy: 'auto',
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          startedAt: new Date(),
        });
      });
    };

    intervalId = setInterval(tick, PERIODIC_SYNC_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
      subscription.remove();
    };
  }, [currentUser, restaurant, currentPin]);
}
```

Check `src/features/sync/syncLogService.ts` for `logSyncAttempt`'s exact exported signature before this step — it's already used identically in `useSyncGate.ts`'s catch branch (`Alert.alert` case) via `syncNow`'s own internal call, so this hook's direct call to it on the `.catch()` path must match that same shape. Read the file if the signature shown above doesn't match what's actually exported, and adjust the call to match — don't guess a second time if it's wrong.

- [ ] **Step 2: Install the hook alongside the existing sync gate**

`useSyncGate()` is already called from `app/(app)/_layout.tsx` (the tabs layout, gated behind login) rather than the true root `app/_layout.tsx` (which only handles pre-login migration/bootstrap). Install `usePeriodicSync()` in that same place, so it only ever runs once a user is actually logged in — matching `useSyncGate`'s own guard clauses, and avoiding a second, redundant "not logged in yet" check.

In `app/(app)/_layout.tsx`, add the import alongside the existing ones:

```ts
import { usePeriodicSync } from '@/features/sync/usePeriodicSync';
```

Find `useSyncGate();` (called near the top of the `AppLayout` component body) and add the new hook call directly after it:

```ts
  useSyncGate();
  usePeriodicSync();
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Requires the API deployed (Tasks 4-6). Check Metro is reachable on the emulator, restart if needed. Log in as Owner. Wait just over 2 minutes with the app in the foreground; check Settings → Sync's history (or watch `preview_logs`/Metro output for the periodic tick firing) to confirm a sync attempt fired automatically without tapping anything. Background the app (press the device Home button) for a couple minutes, foreground it again, and confirm no extra sync fired while backgrounded (the interval should have been effectively paused, not queued up).

- [ ] **Step 5: Commit**

```bash
git add src/features/sync/usePeriodicSync.ts "app/(app)/_layout.tsx"
git commit -m "Add usePeriodicSync for automatic cross-device visibility every 2 minutes"
```

---

## Task 10: Client — `adjustStock()` and the offline outbox

**Files:**
- Create: `src/features/inventory/stockAdjustmentService.ts`

**Interfaces:**
- Consumes: `pendingInventoryDeltas` (Task 1).
- Produces: `adjustStock(input: AdjustStockInput): Promise<void>` and `flushPendingInventoryDeltas(restaurantId: string): Promise<void>` — consumed by Task 11 (rewiring the three stock-changing call sites) and Task 9's periodic hook (Task 12 wires the flush into the same tick).

- [ ] **Step 1: Write the service**

Create `src/features/inventory/stockAdjustmentService.ts`:

```ts
import { eq, isNull } from 'drizzle-orm';
import Constants from 'expo-constants';
import { db } from '@/db/client';
import { inventoryItems, pendingInventoryDeltas } from '@/db/schema';
import { generateId } from '@/lib/id';
import { round2 } from '@/features/tax/taxEngine';

function getApiUrl(): string {
  const apiUrl = Constants.expoConfig?.extra?.supabaseApiUrl as string | undefined;
  if (!apiUrl) {
    throw new Error('Cloud sync is not configured for this app build. Contact support.');
  }
  return apiUrl;
}

export interface AdjustStockInput {
  restaurantId: string;
  pin: string;
  inventoryItemId: string;
  /** Exactly one of delta/setAbsolute. */
  delta?: number;
  setAbsolute?: number;
  reason: 'sale' | 'sale-void' | 'restock' | 'correction';
}

async function callAdjustStock(input: AdjustStockInput): Promise<{ quantity: number }> {
  const response = await fetch(`${getApiUrl()}/inventory/adjust-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Adjust stock failed (${response.status})`);
  }
  return response.json();
}

/** The one place any code in this app changes inventory quantity. Always applies the change to
 * local SQLite immediately (the till is never blocked on network state), then attempts the same
 * change against the server live; if that fails for any reason (offline, timeout, server error),
 * the change is queued in pending_inventory_deltas instead of being lost, to be retried by
 * flushPendingInventoryDeltas() on the next periodic sync tick. */
export async function adjustStock(input: AdjustStockInput): Promise<void> {
  if (input.delta !== undefined) {
    await db
      .update(inventoryItems)
      .set({
        quantity: sql`ROUND(${inventoryItems.quantity} + ${input.delta}, 3)`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, input.inventoryItemId));
  } else if (input.setAbsolute !== undefined) {
    await db
      .update(inventoryItems)
      .set({ quantity: input.setAbsolute, updatedAt: new Date() })
      .where(eq(inventoryItems.id, input.inventoryItemId));
  }

  try {
    await callAdjustStock(input);
  } catch {
    await db.insert(pendingInventoryDeltas).values({
      id: generateId(),
      restaurantId: input.restaurantId,
      inventoryItemId: input.inventoryItemId,
      delta: input.delta ?? null,
      setAbsolute: input.setAbsolute ?? null,
      reason: input.reason,
    });
  }
}

/** Retries every unsynced queued delta, oldest first, against the live endpoint -- called from
 * usePeriodicSync's tick alongside the generic pull, so it piggybacks on the same 2-minute
 * cadence rather than running its own timer. A row that still fails stays queued for the next
 * tick; one that succeeds is marked synced (never deleted, so a device's own history of what it
 * queued and when stays inspectable if something needs debugging later). */
export async function flushPendingInventoryDeltas(restaurantId: string, pin: string): Promise<void> {
  const pending = await db.query.pendingInventoryDeltas.findMany({
    where: (d, { and, eq: eqOp }) => and(eqOp(d.restaurantId, restaurantId), isNull(d.syncedAt)),
    orderBy: (d, { asc }) => asc(d.createdAt),
  });

  for (const row of pending) {
    try {
      await callAdjustStock({
        restaurantId,
        pin,
        inventoryItemId: row.inventoryItemId,
        delta: row.delta ?? undefined,
        setAbsolute: row.setAbsolute ?? undefined,
        reason: row.reason as AdjustStockInput['reason'],
      });
      await db
        .update(pendingInventoryDeltas)
        .set({ syncedAt: new Date() })
        .where(eq(pendingInventoryDeltas.id, row.id));
    } catch {
      // Still offline or the server rejected it — leave it queued, try again next tick.
    }
  }
}
```

Add `sql` to the `drizzle-orm` import at the top of this file (`import { eq, isNull, sql } from 'drizzle-orm';`) — this expression matches the identical pattern already used for the same purpose in `recordSupplierPurchase`'s stock bump (`purchaseService.ts`) and the old `consumeIngredients` (`inventoryService.ts`, being rewired in Task 12).

- [ ] **Step 2: Write the outbox retry logic tests**

`flushPendingInventoryDeltas` touches real SQLite and the network, and this codebase has no existing DB-mocking test harness (every test in `__tests__/` so far — `dateRanges.test.ts`, `syncDiff.test.ts`, `pullSync.test.ts` — tests pure functions with no database). Building a full DB-test harness from scratch is out of scope for this already-large plan under real time pressure. Instead, this task's "succeeds → marked synced, fails → stays queued" behavior is verified as a real integration check, with a mocked `fetch`, using the actual local SQLite database (this project's tests already run against real `expo-sqlite` via `jest-expo`'s preset — confirm this by checking `package.json`'s `"jest"` config, already read earlier this session as `"preset": "jest-expo"`).

Create `__tests__/stockAdjustmentService.test.ts`:

```ts
import { db } from '@/db/client';
import { inventoryItems, pendingInventoryDeltas, restaurants } from '@/db/schema';
import { generateId } from '@/lib/id';
import { adjustStock, flushPendingInventoryDeltas } from '@/features/inventory/stockAdjustmentService';

const RESTAURANT_ID = 'test-restaurant-stock-adj';
const PIN = '0000';

async function seedRestaurantAndItem(startQuantity: number): Promise<string> {
  await db.insert(restaurants).values({ id: RESTAURANT_ID, name: 'Test', country: 'IN', currencyCode: 'INR', currencySymbol: '₹', taxIdLabel: 'GSTIN', invoicePrefix: 'INV', roundingRule: 'nearest_1' }).onConflictDoNothing();
  const itemId = generateId();
  await db.insert(inventoryItems).values({ id: itemId, restaurantId: RESTAURANT_ID, name: 'Test Item', unit: 'kg', quantity: startQuantity });
  return itemId;
}

describe('adjustStock', () => {
  it('always applies the change locally even when the live call fails, and queues it', async () => {
    const itemId = await seedRestaurantAndItem(10);
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    await adjustStock({ restaurantId: RESTAURANT_ID, pin: PIN, inventoryItemId: itemId, delta: -3, reason: 'sale' });

    const item = await db.query.inventoryItems.findFirst({ where: (i, { eq }) => eq(i.id, itemId) });
    expect(item?.quantity).toBe(7);

    const queued = await db.query.pendingInventoryDeltas.findMany({ where: (d, { eq }) => eq(d.inventoryItemId, itemId) });
    expect(queued).toHaveLength(1);
    expect(queued[0].delta).toBe(-3);
    expect(queued[0].syncedAt).toBeNull();
  });

  it('does not queue anything when the live call succeeds', async () => {
    const itemId = await seedRestaurantAndItem(10);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ quantity: 8 }) });

    await adjustStock({ restaurantId: RESTAURANT_ID, pin: PIN, inventoryItemId: itemId, delta: -2, reason: 'sale' });

    const queued = await db.query.pendingInventoryDeltas.findMany({ where: (d, { eq }) => eq(d.inventoryItemId, itemId) });
    expect(queued).toHaveLength(0);
  });
});

describe('flushPendingInventoryDeltas', () => {
  it('marks a successfully-retried delta as synced', async () => {
    const itemId = await seedRestaurantAndItem(5);
    const deltaId = generateId();
    await db.insert(pendingInventoryDeltas).values({ id: deltaId, restaurantId: RESTAURANT_ID, inventoryItemId: itemId, delta: -1, reason: 'sale' });

    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ quantity: 4 }) });
    await flushPendingInventoryDeltas(RESTAURANT_ID, PIN);

    const row = await db.query.pendingInventoryDeltas.findFirst({ where: (d, { eq }) => eq(d.id, deltaId) });
    expect(row?.syncedAt).not.toBeNull();
  });

  it('leaves a still-failing delta queued for the next sweep', async () => {
    const itemId = await seedRestaurantAndItem(5);
    const deltaId = generateId();
    await db.insert(pendingInventoryDeltas).values({ id: deltaId, restaurantId: RESTAURANT_ID, inventoryItemId: itemId, delta: -1, reason: 'sale' });

    global.fetch = jest.fn().mockRejectedValue(new Error('still offline'));
    await flushPendingInventoryDeltas(RESTAURANT_ID, PIN);

    const row = await db.query.pendingInventoryDeltas.findFirst({ where: (d, { eq }) => eq(d.id, deltaId) });
    expect(row?.syncedAt).toBeNull();
  });
});
```

If `global.fetch` isn't already mockable in this project's Jest environment (check whether any existing test mocks `fetch` — if none do and this genuinely doesn't work in the configured environment), report this as a BLOCKED-equivalent concern in your task report rather than silently skipping the test file, and fall back to documenting the exact manual verification that covers the same three behaviors (covered by Task 9's and Task 11's manual steps, which exercise the live-then-queue-then-retry cycle end-to-end on the real emulator) as the reason automated coverage isn't present for this task specifically.

- [ ] **Step 3: Run the tests**

Run: `npx jest __tests__/stockAdjustmentService.test.ts`
Expected: PASS, all 4 tests. If any test needs adjustment because `db.insert(restaurants)`'s required columns don't match what's shown above exactly (the `restaurants` schema may have more required fields than listed), read `src/db/schema/restaurant.ts` and adjust the seed helper's `.values({...})` call to satisfy whatever is actually `.notNull()` there — this is a data-shape detail to confirm against the real schema file, not a decision to make blind.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/stockAdjustmentService.ts __tests__/stockAdjustmentService.test.ts
git commit -m "Add adjustStock() and the offline inventory-delta outbox"
```

---

## Task 11: Client — wire the outbox flush into the periodic tick

**Files:**
- Modify: `src/features/sync/usePeriodicSync.ts`

**Interfaces:**
- Consumes: `flushPendingInventoryDeltas` (Task 10).

- [ ] **Step 1: Add the flush call to the tick**

In `src/features/sync/usePeriodicSync.ts`, add the import:

```ts
import { flushPendingInventoryDeltas } from '@/features/inventory/stockAdjustmentService';
```

The `tick` function currently reads:

```ts
    const tick = () => {
      if (appStateRef.current !== 'active') return;
      syncNow(restaurantId, pin, 'auto').catch((err) => {
        logSyncAttempt({
          restaurantId,
          triggeredBy: 'auto',
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          startedAt: new Date(),
        });
      });
    };
```

Replace with:

```ts
    const tick = () => {
      if (appStateRef.current !== 'active') return;
      syncNow(restaurantId, pin, 'auto').catch((err) => {
        logSyncAttempt({
          restaurantId,
          triggeredBy: 'auto',
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
          startedAt: new Date(),
        });
      });
      flushPendingInventoryDeltas(restaurantId, pin).catch(() => {
        // Individual delta failures are already handled (left queued) inside
        // flushPendingInventoryDeltas itself -- this catch only guards against something
        // unexpected in the flush loop itself, so it never takes down the tick.
      });
    };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/sync/usePeriodicSync.ts
git commit -m "Retry queued inventory deltas on the same periodic sync tick"
```

---

## Task 12: Client — rewire sale-time consumption/restoration

**Files:**
- Modify: `src/features/inventory/inventoryService.ts`

**Interfaces:**
- Consumes: `adjustStock` (Task 10).
- Produces: `consumeIngredients`/`restoreIngredients` gain a required `restaurantId`/`pin` parameter (needed to call the live endpoint) — this changes their call sites, listed below.

- [ ] **Step 1: Update `consumeIngredients`**

In `src/features/inventory/inventoryService.ts`, the function currently reads:

```ts
export async function consumeIngredients(menuItemId: string | null | undefined, quantityDelta: number): Promise<void> {
  if (!menuItemId || quantityDelta === 0) return;
  const rows = await db.query.recipeIngredients.findMany({
    where: (r, { and, eq: eqOp }) => and(eqOp(r.menuItemId, menuItemId), eqOp(r.isActive, true)),
  });
  for (const row of rows) {
    // Rounded to 3dp (matching the NUMERIC(10,3) column in Supabase) at write time, not just
    // on display — floating-point subtraction alone leaves artifacts like 9.400000000000002
    // that would otherwise accumulate further with every subsequent order.
    await db
      .update(inventoryItems)
      .set({
        quantity: sql`ROUND(${inventoryItems.quantity} - ${row.quantityRequired * quantityDelta}, 3)`,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, row.inventoryItemId));
  }
}

/** Inverse of consumeIngredients — restores quantityDelta servings' worth of ingredients. */
export async function restoreIngredients(menuItemId: string | null | undefined, quantityDelta: number): Promise<void> {
  await consumeIngredients(menuItemId, -quantityDelta);
}
```

Replace with:

```ts
export interface ConsumeContext {
  restaurantId: string;
  pin: string;
}

/** Applies quantityDelta servings of menuItemId's recipe to inventory, and attempts to reach
 * the server live for each affected item (queuing on failure) -- see adjustStock() in
 * stockAdjustmentService.ts for why quantity changes go through that instead of a plain local
 * write. `context` carries what adjustStock needs to reach the server; callers already have
 * both values from the logged-in session (see call sites in orderService.ts / cart.tsx). */
export async function consumeIngredients(
  menuItemId: string | null | undefined,
  quantityDelta: number,
  context: ConsumeContext,
): Promise<void> {
  if (!menuItemId || quantityDelta === 0) return;
  const rows = await db.query.recipeIngredients.findMany({
    where: (r, { and, eq: eqOp }) => and(eqOp(r.menuItemId, menuItemId), eqOp(r.isActive, true)),
  });
  for (const row of rows) {
    const delta = round2(-row.quantityRequired * quantityDelta);
    await adjustStock({
      restaurantId: context.restaurantId,
      pin: context.pin,
      inventoryItemId: row.inventoryItemId,
      delta,
      reason: quantityDelta > 0 ? 'sale' : 'sale-void',
    });
  }
}

/** Inverse of consumeIngredients — restores quantityDelta servings' worth of ingredients. */
export async function restoreIngredients(
  menuItemId: string | null | undefined,
  quantityDelta: number,
  context: ConsumeContext,
): Promise<void> {
  await consumeIngredients(menuItemId, -quantityDelta, context);
}
```

Add the new imports this needs at the top of the file:

```ts
import { adjustStock } from './stockAdjustmentService';
import { round2 } from '@/features/tax/taxEngine';
```

(`round2` may already be imported in this file for other purposes — check first and don't duplicate the import line if so.)

Note: `adjustStock`'s own local write inside `stockAdjustmentService.ts` already applies the `ROUND(quantity ± delta, 3)` SQL expression directly (see Task 10) — this replaces the inline `db.update(inventoryItems)...` call that used to live directly in `consumeIngredients`, since that local-write responsibility now belongs to `adjustStock` alone (the one place quantity is ever locally written, per this plan's Global Constraints).

- [ ] **Step 2: Update every call site**

Find every caller of `consumeIngredients`/`restoreIngredients`:

```bash
grep -rn "consumeIngredients(\|restoreIngredients(" app/ src/ --include="*.ts" --include="*.tsx"
```

For each call site found, add the third `context: { restaurantId, pin }` argument, sourcing `restaurantId` from `useRestaurantId()` (already used throughout this app's screens) and `pin` from `useAuthStore((s) => s.currentPin)` (the same source `useSyncGate`/`usePeriodicSync` already use). Read each call site's surrounding component/function to confirm both values are already available there (they should be, in every order-mutation code path, since the app requires an active login to reach any of them) — if a call site is in a plain service function rather than a component, thread the two values through as parameters from whichever caller does have them, the same way this task threaded them into `consumeIngredients` itself.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Every call site must now pass the third argument — a missing one is a real compile error here, not something to silence.

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all suites pass. If any existing test calls `consumeIngredients`/`restoreIngredients` directly, update it to pass a `context` object too (e.g. `{ restaurantId: 'test-restaurant', pin: '0000' }`) — check `__tests__/` for any such test before assuming none exist.

- [ ] **Step 5: Commit**

Run `git status --short` to see the exact list of files Step 2's call-site updates touched, alongside `inventoryService.ts` itself. Stage and commit all of them together (do not use a broad `git add -A` — name each file explicitly, since this working tree has pre-existing unrelated uncommitted changes from earlier sessions that must stay out of this commit):

```bash
git add src/features/inventory/inventoryService.ts <each call-site file from git status, listed explicitly>
git commit -m "Route sale-time inventory consumption through adjustStock"
```

---

## Task 13: Client — rewire Purchase entry's stock bump

**Files:**
- Modify: `src/features/inventory/purchaseService.ts`
- Modify: `app/(app)/inventory/purchase.tsx`

**Interfaces:**
- Consumes: `adjustStock` (Task 10).
- Produces: `recordSupplierPurchase`'s signature gains `pin: string` (needed post-transaction to call `adjustStock` for existing items).

- [ ] **Step 1: Update `recordSupplierPurchase`**

In `src/features/inventory/purchaseService.ts`, `RecordSupplierPurchaseInput` currently reads:

```ts
export interface RecordSupplierPurchaseInput {
  restaurantId: string;
  staffId: string;
  /** Defaults to now -- override for a purchase entered a day (or more) late, so it still counts
   * against the day it actually happened rather than the day someone got around to logging it. */
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
```

Add a `pin: string` field:

```ts
export interface RecordSupplierPurchaseInput {
  restaurantId: string;
  staffId: string;
  /** Needed after the local transaction commits, to attempt a live adjustStock() call for each
   * line that bumped an EXISTING item's stock (a brand-new item's starting quantity needs no
   * such call -- see the function body for why). */
  pin: string;
  /** Defaults to now -- override for a purchase entered a day (or more) late, so it still counts
   * against the day it actually happened rather than the day someone got around to logging it. */
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
```

The function body currently ends its per-line loop with the direct local update:

```ts
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
```

Replace the whole function to track which lines bumped an *existing* item (vs. a brand-new one created moments earlier in the same transaction, which needs no live call — see Task 5's Step 1 comment on why a new row's first-ever quantity travels through the normal insert path instead), and call `adjustStock` for those after the transaction commits:

```ts
export async function recordSupplierPurchase(input: RecordSupplierPurchaseInput): Promise<string> {
  const purchasedAt = input.purchasedAt ?? new Date();
  const existingItemBumps: { inventoryItemId: string; quantity: number }[] = [];

  const purchaseId = await db.transaction(async (tx) => {
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
      const isExistingItem = !!line.inventoryItemId;

      let inventoryItemId = line.inventoryItemId;
      if (!inventoryItemId) {
        inventoryItemId = generateId();
        await tx.insert(inventoryItems).values({
          id: inventoryItemId,
          restaurantId: input.restaurantId,
          name: line.newItemName!,
          category: line.newItemCategory || undefined,
          unit: line.newItemUnit!,
          quantity: line.quantity,
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

      if (isExistingItem) {
        await tx
          .update(inventoryItems)
          .set({
            quantity: sql`ROUND(${inventoryItems.quantity} + ${line.quantity}, 3)`,
            costPerUnit: line.costPerUnit,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, inventoryItemId));
        existingItemBumps.push({ inventoryItemId, quantity: line.quantity });
      } else {
        // Brand-new item created moments ago in this same transaction -- its costPerUnit was
        // already set at insert time above; nothing more to update here.
      }
    }

    return purchaseId;
  });

  for (const bump of existingItemBumps) {
    await adjustStock({
      restaurantId: input.restaurantId,
      pin: input.pin,
      inventoryItemId: bump.inventoryItemId,
      delta: bump.quantity,
      reason: 'restock',
    });
  }

  return purchaseId;
}
```

Note the brand-new-item branch now sets `quantity: line.quantity` directly at insert time (previously `quantity: 0`, with the bump applied by the same update every line went through) — since the new-item case never runs through `adjustStock`'s local-write-then-live-call cycle at all (there's no existing server row to race against on the FIRST purchase of a never-before-seen item), the local insert is now the only place its starting quantity is ever set, so it must be correct there rather than relying on a bump that no longer happens for this branch.

Add the new import:

```ts
import { adjustStock } from './stockAdjustmentService';
```

- [ ] **Step 2: Update the call site**

In `app/(app)/inventory/purchase.tsx`, `saveMutation`'s call to `recordSupplierPurchase` needs a `pin` field added to its input object. Read the current file to find `useAuthStore` usage (this screen already reads `currentUser` from `useAuthStore` for `staffId`) — add `currentPin` the same way:

```ts
  const currentPin = useAuthStore((s) => s.currentPin);
```

Add `pin: currentPin!,` to the `recordSupplierPurchase({...})` call's input object (alongside the existing `staffId: currentUser.id,`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/inventory/purchaseService.ts "app/(app)/inventory/purchase.tsx"
git commit -m "Route Purchase entry's stock bump through adjustStock for existing items"
```

---

## Task 14: Client — rewire manual quantity correction

**Files:**
- Modify: `src/features/inventory/inventoryService.ts`
- Modify: `app/(app)/inventory/[id].tsx`

**Interfaces:**
- Consumes: `adjustStock` (Task 10).
- Produces: `updateInventoryItem`'s accepted input no longer includes `quantity` — it is the one field callers can no longer set through it.

- [ ] **Step 1: Remove `quantity` from `updateInventoryItem`'s accepted input**

In `src/features/inventory/inventoryService.ts`, find `InventoryItemInput` and `updateInventoryItem`. `InventoryItemInput` currently includes `quantity: number;` among its fields (used by both `createInventoryItem`, where a starting quantity is legitimate, and `updateInventoryItem`, where it no longer should be). Split it:

```ts
export interface InventoryItemInput {
  restaurantId: string;
  name: string;
  category?: string;
  unit: string;
  quantity: number;
  lowStockThreshold?: number;
  costPerUnit?: number;
}
```

Leave `InventoryItemInput` and `createInventoryItem` exactly as they are (a brand-new item's starting quantity is a normal, direct write — no server row exists yet to race against). Find `updateInventoryItem`'s current signature and body:

```ts
export async function updateInventoryItem(id: string, input: Partial<InventoryItemInput>): Promise<void> {
  await db
    .update(inventoryItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id));
}
```

Replace with a signature that excludes `quantity` from what it accepts, so a caller physically cannot route a quantity change through this function:

```ts
export type InventoryItemUpdateInput = Partial<Omit<InventoryItemInput, 'quantity'>>;

export async function updateInventoryItem(id: string, input: InventoryItemUpdateInput): Promise<void> {
  await db
    .update(inventoryItems)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(inventoryItems.id, id));
}
```

- [ ] **Step 2: Update the Inventory item editor's save mutation**

In `app/(app)/inventory/[id].tsx`, add the imports:

```ts
import { adjustStock } from '@/features/inventory/stockAdjustmentService';
import { useAuthStore } from '@/store/authStore';
```

Add near the other hooks at the top of the component:

```ts
  const currentPin = useAuthStore((s) => s.currentPin);
```

`saveMutation` currently reads:

```ts
  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = {
        restaurantId,
        name,
        category: category ?? undefined,
        unit,
        quantity: parseFloat(quantity) || 0,
        lowStockThreshold: lowStockThreshold ? parseFloat(lowStockThreshold) : undefined,
        costPerUnit: costPerUnit ? parseFloat(costPerUnit) : undefined,
      };
      if (isNew) {
        await createInventoryItem(input);
      } else {
        await updateInventoryItem(id, input);
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });
```

Replace with a version that keeps `createInventoryItem`'s call exactly as-is (new items still get a starting quantity directly), but for an edit, saves every other field via `updateInventoryItem` and — only if the quantity field actually changed from what was loaded — separately calls `adjustStock` with `setAbsolute`:

```ts
  const saveMutation = useMutation({
    mutationFn: async () => {
      const newQuantity = parseFloat(quantity) || 0;
      if (isNew) {
        await createInventoryItem({
          restaurantId,
          name,
          category: category ?? undefined,
          unit,
          quantity: newQuantity,
          lowStockThreshold: lowStockThreshold ? parseFloat(lowStockThreshold) : undefined,
          costPerUnit: costPerUnit ? parseFloat(costPerUnit) : undefined,
        });
        return;
      }

      await updateInventoryItem(id, {
        restaurantId,
        name,
        category: category ?? undefined,
        unit,
        lowStockThreshold: lowStockThreshold ? parseFloat(lowStockThreshold) : undefined,
        costPerUnit: costPerUnit ? parseFloat(costPerUnit) : undefined,
      });

      const originalQuantity = itemQuery.data?.quantity ?? 0;
      if (newQuantity !== originalQuantity) {
        await adjustStock({
          restaurantId,
          pin: currentPin!,
          inventoryItemId: id,
          setAbsolute: newQuantity,
          reason: 'correction',
        });
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. Every other caller of `updateInventoryItem` across the app must not be passing `quantity` — search for other call sites (`grep -rn "updateInventoryItem(" app/ src/`) and confirm; if any other caller does pass `quantity`, that's a real compile error this step surfaces, and it needs the same treatment (split into the non-quantity update plus a separate `adjustStock` call) rather than being worked around.

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: all suites pass.

- [ ] **Step 5: Manual verification**

Requires the API + Supabase migration from Task 6 live. Log in as Owner on the emulator. Open an existing inventory item, change "Quantity in stock" to a different number, save. Confirm the save succeeds and the new quantity displays correctly on reopening the item (proving the `adjustStock(setAbsolute)` path works end-to-end, not just that it compiles).

- [ ] **Step 6: Commit**

```bash
git add src/features/inventory/inventoryService.ts "app/(app)/inventory/[id].tsx"
git commit -m "Route manual quantity corrections through adjustStock as an absolute set"
```

---

## Final check (after all 14 tasks)

- [ ] Run the full test suite: `npx jest` — expect all suites passing, including the new `pullSync.test.ts` cases.
- [ ] Run a full typecheck: `npx tsc --noEmit` (both root and `cd api && npx tsc --noEmit`) — expect only the pre-existing unrelated errors.
- [ ] Deploy the API (Tasks 4, 5, 6 all touched `api/src/index.ts` — this is the single deploy point for all three, from the repo root per this project's established `railway up` convention, never from inside `api/`).
- [ ] Confirm with the user that `supabase/migrations/013_adjust_inventory_quantity.sql` has been run against the live database — required before the API deploy above can actually work, same ordering discipline as every migration this session.
- [ ] Manual end-to-end verification against the real incident: with the API deployed and the migration run, sync the Owner's actual device for Quality Bites and confirm today's orders (the ones originally missing) now appear in Reports within one periodic tick or a manual "Sync Now".
