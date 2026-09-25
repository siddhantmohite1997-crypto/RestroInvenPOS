import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getSubscriptionStatus, parseDateOnly } from './subscriptionDates';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// A full sync payload scales with the restaurant's menu size (e.g. 276 items + modifiers +
// inventory for a real client) and can comfortably exceed Express's 100kb default, so this
// needs real headroom rather than the default.
app.use(express.json({ limit: '20mb' }));

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TYPES
// ============================================================================

interface SyncRequest {
  restaurantId: string;
  pin: string;
  syncData: Record<string, unknown>;
}

interface SyncResponse {
  success: boolean;
  syncedAt: string;
  pushedCounts: Record<string, number>;
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Verify PIN and restaurant status
 */
async function verifyPinAuth(
  restaurantId: string,
  pin: string,
): Promise<{ valid: boolean; reason?: string }> {
  // Check if restaurant exists and is enabled
  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('enabled')
    .eq('id', restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    if (restaurantError) {
      // A real DB/network error (e.g. transient failure under concurrent load) looks
      // identical to "doesn't exist" to the caller unless we log the actual cause here.
      console.error(
        `verifyPinAuth: restaurant lookup failed for ${restaurantId}:`,
        restaurantError,
      );
    }
    return { valid: false, reason: 'Restaurant not found' };
  }

  if (!restaurant.enabled) {
    return { valid: false, reason: 'Restaurant is currently disabled' };
  }

  // Hash the PIN and verify against staff records
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('pin_hash', pinHash)
    .single();

  if (staffError || !staff) {
    if (staffError) {
      console.error(`verifyPinAuth: staff lookup failed for ${restaurantId}:`, staffError);
    }
    return { valid: false, reason: 'Invalid PIN' };
  }

  return { valid: true };
}

// ============================================================================
// TABLE MAP (shared by /sync's push and /restore's pull)
// ============================================================================

// Object key order below is also FK-safe upsert order, and it matters: each table must come
// after every table it has a foreign key into (e.g. menuItems references taxRules, so taxRules
// must be upserted first) or the insert fails on a missing FK target. This is NOT the same
// order syncService.ts happens to collect the data in on the client — that order only reflects
// independent SELECT queries and has no FK constraints to respect. /restore's client-side
// insert must walk this same order (parents before children) for the same reason.
const TABLE_MAP: Record<string, { table: string; conflictTarget: string }> = {
  restaurants: { table: 'restaurants', conflictTarget: 'id' },
  suppliers: { table: 'suppliers', conflictTarget: 'id' },
  purchases: { table: 'purchases', conflictTarget: 'id' },
  categories: { table: 'categories', conflictTarget: 'id' },
  taxRules: { table: 'tax_rules', conflictTarget: 'id' },
  taxComponents: { table: 'tax_components', conflictTarget: 'id' },
  menuItems: { table: 'menu_items', conflictTarget: 'id' },
  modifierGroups: { table: 'modifier_groups', conflictTarget: 'id' },
  modifiers: { table: 'modifiers', conflictTarget: 'id' },
  menuItemModifierGroups: {
    table: 'menu_item_modifier_groups',
    conflictTarget: 'menu_item_id,modifier_group_id',
  },
  comboDeals: { table: 'combo_deals', conflictTarget: 'id' },
  comboDealItems: { table: 'combo_deal_items', conflictTarget: 'id' },
  inventoryItems: { table: 'inventory_items', conflictTarget: 'id' },
  inventoryPurchases: { table: 'inventory_purchases', conflictTarget: 'id' },
  recipeIngredients: { table: 'recipe_ingredients', conflictTarget: 'id' },
  diningTables: { table: 'dining_tables', conflictTarget: 'id' },
  orders: { table: 'orders', conflictTarget: 'id' },
  orderItems: { table: 'order_items', conflictTarget: 'id' },
  orderItemModifiers: { table: 'order_item_modifiers', conflictTarget: 'id' },
  discounts: { table: 'discounts', conflictTarget: 'id' },
  payments: { table: 'payments', conflictTarget: 'id' },
  auditLogs: { table: 'audit_logs', conflictTarget: 'id' },
};

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

// ============================================================================
// PAIR ENDPOINT
// ============================================================================

/**
 * A phone with no local restaurant yet calls this once to attach itself to an
 * existing cloud restaurant. Unlike /sync, this returns real data — the restaurant's
 * business fields and the ONE staff record that matched the PIN (never other staff,
 * never any password/hash) — so the app can seed its own local restaurant + staff row
 * and let the user log in with the same PIN they just typed.
 */
app.post('/pair', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin } = req.body as { restaurantId?: string; pin?: string };

    if (!restaurantId || !pin) {
      return res.status(400).json({ error: 'restaurantId and pin required' });
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (restaurantError || !restaurant) {
      if (restaurantError)
        console.error(`/pair: restaurant lookup failed for ${restaurantId}:`, restaurantError);
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    if (!restaurant.enabled) {
      return res.status(403).json({ error: 'Restaurant is currently disabled' });
    }

    const pinHash = crypto.createHash('sha256').update(pin).digest('hex');
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, role')
      .eq('restaurant_id', restaurantId)
      .eq('pin_hash', pinHash)
      .single();

    if (staffError || !staff) {
      if (staffError) console.error(`/pair: staff lookup failed for ${restaurantId}:`, staffError);
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    res.json({ restaurant, staff });
  } catch (err) {
    console.error('Pair error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Pairing failed' });
  }
});

// ============================================================================
// RESTORE ENDPOINT
// ============================================================================

const RESTORE_PAGE_SIZE = 1000;

/** PostgREST caps a single response at 1000 rows by default — page through with .range()
 * so a restaurant with more than 1000 orders (or any other table) doesn't silently lose data. */
async function fetchAllRows(
  pgTable: string,
  restaurantId: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(pgTable)
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('id', { ascending: true })
      .range(from, from + RESTORE_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < RESTORE_PAGE_SIZE) break;
    from += RESTORE_PAGE_SIZE;
  }
  return rows;
}

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
    const { data, error } = await query
      .order('id', { ascending: true })
      .range(from, from + RESTORE_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < RESTORE_PAGE_SIZE) break;
    from += RESTORE_PAGE_SIZE;
  }
  return rows;
}

/** How many parent ids get inlined into a single PostgREST `in.(...)` filter. A restaurant with
 * thousands of changed orders would otherwise put thousands of uuids into one URL and get a 414
 * back from the proxy long before Postgres ever saw the query. */
const CHILD_PARENT_ID_BATCH_SIZE = 200;

/** Child rows belonging to a set of parent ids -- an order's items/discounts/payments (keyed by
 * order_id), or an order item's modifiers (keyed by order_item_id, since order_item_modifiers
 * has no order_id column at all -- see supabase/schema.sql).
 *
 * Does two things a bare `.in(parentColumn, parentIds)` does not:
 *   (a) chunks the id list (URL-length ceiling, see CHILD_PARENT_ID_BATCH_SIZE above), and
 *   (b) pages each chunk with .range(), exactly like fetchAllRows/fetchChangedRows, because
 *       PostgREST caps a single response at 1000 rows -- without this, any restaurant with more
 *       than ~1000 order_items across the pulled orders silently received truncated data with no
 *       error of any kind.
 * Like the two helpers above it also orders by id: .range() paging without an ORDER BY has no
 * guaranteed row order between pages, which can duplicate or skip rows across page boundaries. */
async function fetchChildRowsByParentIds(
  pgTable: string,
  parentColumn: string,
  parentIds: string[],
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < parentIds.length; i += CHILD_PARENT_ID_BATCH_SIZE) {
    const idsChunk = parentIds.slice(i, i + CHILD_PARENT_ID_BATCH_SIZE);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from(pgTable)
        .select('*')
        .in(parentColumn, idsChunk)
        .order('id', { ascending: true })
        .range(from, from + RESTORE_PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < RESTORE_PAGE_SIZE) break;
      from += RESTORE_PAGE_SIZE;
    }
  }
  return rows;
}

/**
 * Called right after /pair (or standalone, re-authenticated the same way) to pull every row
 * this restaurant has in the cloud back down onto a device that just attached to it — a brand
 * new phone, or the SAME phone after an uninstall/reinstall wiped its local SQLite. Without
 * this, pairing only ever seeded the restaurant's own business-details row and the ONE staff
 * record whose PIN was typed in; every menu item, inventory item, recipe link, other staff
 * member, tax rule, and order history the restaurant had built up was invisible on the new
 * device even though it was sitting in Supabase the whole time.
 *
 * Auth is the same restaurantId+PIN check as /pair — any staff member's own PIN can trigger a
 * restore, matching how pairing itself already works regardless of role.
 *
 * Staff PINs are never sent in restorable form to a device other than their own: the `staff`
 * array returned here carries `pin_hash`, which is the cloud's unsalted SHA-256(pin) (see
 * verifyPinAuth above) — not reversible to the plaintext PIN, and not usable as-is for local
 * login (the device's own scheme is a per-device-salted hash). The client stores it as a
 * one-time bridge so that staff member's real first login on this device can verify against it
 * and upgrade to a proper local salted hash — see tryCloudPinFallback in authService.ts.
 */
app.post('/restore', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin } = req.body as { restaurantId?: string; pin?: string };

    if (!restaurantId || !pin) {
      return res.status(400).json({ error: 'restaurantId and pin required' });
    }

    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.reason || 'Authentication failed' });
    }

    // No is_active column on the cloud staff table -- it has no soft-delete concept, unlike
    // the local users table. Every restored staff row is treated as active.
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, role, pin_hash')
      .eq('restaurant_id', restaurantId);
    if (staffError) {
      console.error(`/restore: staff lookup failed for ${restaurantId}:`, staffError);
      throw staffError;
    }

    const data: Record<string, Record<string, unknown>[]> = {};
    for (const [jsKey, { table: pgTable }] of Object.entries(TABLE_MAP)) {
      if (jsKey === 'restaurants') continue; // fetched separately below, keyed by id not restaurant_id
      data[jsKey] = await fetchAllRows(pgTable, restaurantId);
    }

    res.json({ staff: staff ?? [], data });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Restore failed' });
  }
});

// ============================================================================
// STAFF ENDPOINT
// ============================================================================

/**
 * Push a staff member created/edited on-device to the cloud staff table. Local staff
 * management (Settings > Staff) never went through this before — it only ever wrote to the
 * device's local SQLite `users` table, so a staff member added on one device could never be
 * used to pair another device, never showed up in the admin panel, and would be lost for good
 * if that device was ever reset. `authPin` must belong to an existing, already-cloud-known
 * staff member of the same restaurant (normally whoever is logged in and doing the editing).
 */
app.post('/staff', async (req: Request, res: Response) => {
  try {
    const { restaurantId, authPin, staffId, name, role, pin } = req.body as {
      restaurantId?: string;
      authPin?: string;
      staffId?: string;
      name?: string;
      role?: string;
      pin?: string;
    };

    if (!restaurantId || !authPin || !staffId || !name || !role) {
      return res
        .status(400)
        .json({ error: 'restaurantId, authPin, staffId, name, and role required' });
    }

    const auth = await verifyPinAuth(restaurantId, authPin);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.reason || 'Authentication failed' });
    }

    // pin_hash is NOT NULL in the staff table. Omitting `pin` on an edit is normally fine -- it
    // means "keep the current hash" -- but Supabase's upsert() does NOT do a true partial merge
    // on conflict: a column left out of the payload is written as NULL on the UPDATE path too,
    // not "leave unchanged" (confirmed directly against Postgres -- this crashed even though a
    // row already existed). So a pin-less edit of any existing staff member always crashed here,
    // not just a never-synced one. Fix: when no pin is given, look up the existing row and do an
    // explicit .update() that simply never mentions pin_hash, instead of .upsert() -- a real
    // partial UPDATE, unlike upsert's all-or-nothing column list. Only fall through to insert
    // (via upsert, pin_hash included) when a pin is actually given.
    if (!pin) {
      const { data: existingStaff } = await supabase
        .from('staff')
        .select('id')
        .eq('id', staffId)
        .maybeSingle();
      if (!existingStaff) {
        return res.status(400).json({
          error: `${name} hasn't been synced to the cloud before -- enter their PIN once to finish setting them up.`,
        });
      }

      const { error: updateError } = await supabase
        .from('staff')
        .update({ restaurant_id: restaurantId, name, role })
        .eq('id', staffId);
      if (updateError) {
        console.error(`Error updating staff ${staffId}:`, updateError);
        return res.status(500).json({ error: updateError.message });
      }
      return res.json({ success: true });
    }

    const upsertRow: Record<string, unknown> = {
      id: staffId,
      restaurant_id: restaurantId,
      name,
      role,
      pin_hash: crypto.createHash('sha256').update(pin).digest('hex'),
    };

    const { error } = await supabase.from('staff').upsert(upsertRow, { onConflict: 'id' });
    if (error) {
      console.error(`Error upserting staff ${staffId}:`, error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Staff push error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Staff push failed' });
  }
});

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

// ============================================================================
// SYNC ENDPOINT
// ============================================================================

app.post('/sync', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin, syncData, checkOnly, lastPulledAt } = req.body as SyncRequest & {
      checkOnly?: boolean;
      lastPulledAt?: string | null;
    };

    if (!restaurantId || !pin) {
      return res.status(400).json({ error: 'restaurantId and pin required' });
    }

    // A lightweight "is this restaurant reachable and enabled" probe used at login. This must
    // NOT go through verifyPinAuth (which also requires the PIN to match a row in the cloud
    // staff table): staff added on-device via Settings > Staff are local-only until explicitly
    // pushed to the cloud, so gating this on staff-PIN match would lock a brand new staff
    // member out of their own device just because Supabase doesn't know them yet. All this
    // probe needs to answer is "does this restaurant exist and is it enabled".
    if (checkOnly) {
      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('enabled, subscription_plan, next_due_date')
        .eq('id', restaurantId)
        .single();

      if (restaurantError || !restaurant) {
        if (restaurantError)
          console.error(
            `/sync checkOnly: restaurant lookup failed for ${restaurantId}:`,
            restaurantError,
          );
        return res.status(404).json({ error: 'Restaurant not found' });
      }
      if (!restaurant.enabled) {
        return res.status(401).json({ error: 'Restaurant is currently disabled' });
      }

      // Reported to the app so it can show a payment-reminder popup after login (Owner/Captain
      // only, decided client-side) -- never null when a reminder is warranted, since a plan
      // without a subscription_plan set is intentionally excluded (tier would be meaningless).
      let subscriptionReminder: { tier: string; message: string; nextDueDate: string } | null = null;
      if (restaurant.subscription_plan && restaurant.next_due_date) {
        const status = getSubscriptionStatus(parseDateOnly(restaurant.next_due_date), new Date());
        if (status.tier !== 'ok') {
          subscriptionReminder = { tier: status.tier, message: status.message, nextDueDate: restaurant.next_due_date };
        }
      }

      return res.json({ success: true, enabled: true, checkOnly: true, subscriptionReminder });
    }

    // Verify PIN and restaurant
    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.reason || 'Authentication failed' });
    }

    // Sync data
    const pushedCounts: Record<string, number> = {};

    // The client's syncData is keyed by Drizzle's camelCase JS field names (e.g. "menuItems"),
    // not the underlying snake_case Postgres table names — map each to its real table, and
    // convert every row's own keys the same way (customerEmail -> customer_email, etc.),
    // since PostgREST matches JSON keys to column names literally with no case folding.
    // menuItemModifierGroups has no `id` column locally (composite key on menuItemId+modifierGroupId),
    // so it needs its own onConflict target instead of the default 'id'. See the shared
    // TABLE_MAP above for the FK-safe key order this loop relies on.

    const toSnakeCase = (key: string) =>
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const rowToSnakeCase = (row: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        result[toSnakeCase(key)] = value;
      }
      return result;
    };

    // Batched, not one upsert call per row: a real restaurant's first sync easily carries
    // several hundred rows (menu items, modifier links, etc.), and awaiting a separate
    // network round-trip to Supabase for each one serialized into tens of seconds of pure
    // latency -- the actual cause of "Sync timed out", not payload size or connection quality.
    const SYNC_BATCH_SIZE = 500;

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

    // Captured before running any pull queries -- any row written concurrently with this
    // request either lands in this response (if its timestamp query already covers it) or the
    // next one (since its timestamp will be > this captured moment either way). Never both
    // included and later missed.
    const serverNow = new Date();

    const pulledData: Record<string, unknown[]> = {};
    const sinceIso = lastPulledAt ?? null;

    // Staff roster, fetched FIRST and in full on every tick. orders.opened_by_staff_id,
    // discounts.applied_by_staff_id, payments.received_by_staff_id and audit_logs.staff_id are
    // all NOT NULL FKs into the client's local `users` table, but staff has never been part of
    // the generic TABLE_MAP-driven sync (staff pushes go through POST /staff, and a device only
    // ever learned the roster via the one-time /pair or /restore). So a staff member added on
    // device A was unknown to device B forever, and the first pulled order they opened failed
    // B's FK, rolled back B's whole pull transaction, never reached setLastPulledAt, and made B
    // retry the identical failing payload on every tick. The client turns these rows into
    // placeholder `users` rows before applying anything that references them.
    //
    // Uncursored on purpose: the cloud `staff` table has no updated_at column at all (see
    // supabase/schema.sql -- only created_at), so it cannot be filtered incrementally like every
    // other table here. It is a handful of rows per restaurant, so refetching it is cheap.
    pulledData.staff = await fetchAllRows('staff', restaurantId);

    for (const [jsKey, { table: pgTable }] of Object.entries(TABLE_MAP)) {
      if (jsKey === 'restaurants') continue; // fetched separately below, keyed by id not restaurant_id
      if (jsKey === 'orders') continue; // handled specially below, with its children
      if ((ORDER_CHILD_TABLES as readonly string[]).includes(jsKey)) continue;
      const timestampColumn = APPEND_ONLY_TABLES.has(jsKey) ? 'created_at' : 'updated_at';
      pulledData[jsKey] = await fetchChangedRows(pgTable, restaurantId, timestampColumn, sinceIso);
    }

    // restaurants is the one table with no restaurant_id column of its own -- it IS the
    // restaurant record -- so it can't go through fetchChangedRows (which filters on
    // restaurant_id and would fail with PostgREST 42703 "column does not exist"). Same special
    // case /restore already makes for it above; fetched by id, still respecting the pull cursor.
    let restaurantQuery = supabase.from('restaurants').select('*').eq('id', restaurantId);
    if (sinceIso !== null) {
      restaurantQuery = restaurantQuery.gt('updated_at', sinceIso);
    }
    const { data: restaurantRows, error: restaurantPullError } = await restaurantQuery;
    if (restaurantPullError) throw restaurantPullError;
    // Possibly empty (unchanged since the cursor) -- the client applies it as an ordinary
    // last-write-wins row, so an empty array simply means "nothing to adopt this tick".
    pulledData.restaurants = restaurantRows ?? [];

    // Orders: find which orders changed, then pull ALL current rows of their four child tables
    // for exactly those orders -- never filtered by the children's own timestamps, matching how
    // the push side already resends an order's children in full whenever the order itself is
    // dirty, rather than diffing them individually.
    const changedOrders = await fetchChangedRows('orders', restaurantId, 'updated_at', sinceIso);
    pulledData.orders = changedOrders;
    const changedOrderIds = changedOrders.map((o) => o.id as string);

    // Three of the four child tables hang off order_id and can be fetched straight from the
    // changed order ids. order_item_modifiers CANNOT: the cloud table has no order_id column at
    // all (see supabase/schema.sql -- it's keyed by order_item_id only), so querying it by
    // order_id threw PostgREST 42703 and 500'd every /sync that pulled an order with modifiers.
    // It therefore has to run AFTER order_items, keyed by the ids those rows just returned.
    // All four go through fetchChildRowsByParentIds for batching + .range() paging (see there).
    const orderItemRows = await fetchChildRowsByParentIds(
      TABLE_MAP.orderItems.table,
      'order_id',
      changedOrderIds,
    );
    pulledData.orderItems = orderItemRows;
    pulledData.discounts = await fetchChildRowsByParentIds(
      TABLE_MAP.discounts.table,
      'order_id',
      changedOrderIds,
    );
    pulledData.payments = await fetchChildRowsByParentIds(
      TABLE_MAP.payments.table,
      'order_id',
      changedOrderIds,
    );
    pulledData.orderItemModifiers = await fetchChildRowsByParentIds(
      TABLE_MAP.orderItemModifiers.table,
      'order_item_id',
      orderItemRows.map((i) => i.id as string),
    );

    const newPulledAt = serverNow.toISOString();

    // Update last_synced_at
    await supabase
      .from('restaurants')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', restaurantId);

    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      pushedCounts,
      pulledData,
      newPulledAt,
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Sync failed',
    });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Enable a restaurant (admin only)
 */
app.post('/admin/enable', async (req: Request, res: Response) => {
  try {
    const { restaurantId, adminPin } = req.body;

    // TODO: Verify admin credentials
    // For now, we'll require a master admin PIN from env vars
    if (adminPin !== process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    if (!restaurantId) {
      return res.status(400).json({ error: 'restaurantId required' });
    }

    const { error } = await supabase
      .from('restaurants')
      .update({ enabled: true, updated_at: new Date().toISOString() })
      .eq('id', restaurantId);

    if (error) throw error;

    res.json({ success: true, message: `Restaurant ${restaurantId} enabled` });
  } catch (err) {
    console.error('Enable error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Enable failed',
    });
  }
});

/**
 * Disable a restaurant (admin only)
 */
app.post('/admin/disable', async (req: Request, res: Response) => {
  try {
    const { restaurantId, adminPin, reason } = req.body;

    // Verify admin credentials
    if (adminPin !== process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    if (!restaurantId) {
      return res.status(400).json({ error: 'restaurantId required' });
    }

    const { error } = await supabase
      .from('restaurants')
      .update({
        enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurantId);

    if (error) throw error;

    res.json({ success: true, message: `Restaurant ${restaurantId} disabled` });
  } catch (err) {
    console.error('Disable error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Disable failed',
    });
  }
});

/**
 * Get restaurant status (admin only)
 */
app.post('/admin/status', async (req: Request, res: Response) => {
  try {
    const { restaurantId, adminPin } = req.body;

    // Verify admin credentials
    if (adminPin !== process.env.ADMIN_PIN) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    if (!restaurantId) {
      return res.status(400).json({ error: 'restaurantId required' });
    }

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('id, name, enabled, last_synced_at')
      .eq('id', restaurantId)
      .single();

    if (error || !restaurant) {
      return res.status(404).json({ error: 'Restaurant not found' });
    }

    res.json(restaurant);
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Status check failed',
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// START SERVER
// ============================================================================

// Body-parser errors (oversized or malformed JSON) throw before any route handler runs, and
// Express's default error handler renders them as an HTML page. The mobile client always
// expects JSON back, so an HTML error page there surfaces as a confusing
// "JSON Parse error: Unexpected character: <" instead of the actual problem -- catch it here
// and always answer with JSON.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { status?: number; type?: string }, req: Request, res: Response, next: NextFunction) => {
  const status = err.status ?? 500;
  const message =
    err.type === 'entity.too.large'
      ? 'Sync payload too large for the server to accept. Contact support.'
      : err.message || 'Unexpected server error';
  console.error('Unhandled request error:', err);
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`POS API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Sync endpoint: POST http://localhost:${PORT}/sync`);
});
