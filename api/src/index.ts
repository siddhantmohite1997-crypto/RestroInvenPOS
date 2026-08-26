import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
      console.error(`verifyPinAuth: restaurant lookup failed for ${restaurantId}:`, restaurantError);
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
      if (restaurantError) console.error(`/pair: restaurant lookup failed for ${restaurantId}:`, restaurantError);
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
// SYNC ENDPOINT
// ============================================================================

app.post('/sync', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin, syncData, checkOnly } = req.body as SyncRequest & { checkOnly?: boolean };

    if (!restaurantId || !pin) {
      return res.status(400).json({ error: 'restaurantId and pin required' });
    }

    // Verify PIN and restaurant
    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.reason || 'Authentication failed' });
    }

    // A lightweight "is this restaurant reachable and enabled" probe — same auth path as a
    // real sync, but skips the data push entirely. Used at login (to warn immediately if the
    // restaurant's been disabled) without pushing a full sync just to check status.
    if (checkOnly) {
      return res.json({ success: true, enabled: true, checkOnly: true });
    }

    // Sync data
    const pushedCounts: Record<string, number> = {};

    // The client's syncData is keyed by Drizzle's camelCase JS field names (e.g. "menuItems"),
    // not the underlying snake_case Postgres table names — map each to its real table, and
    // convert every row's own keys the same way (customerEmail -> customer_email, etc.),
    // since PostgREST matches JSON keys to column names literally with no case folding.
    // menuItemModifierGroups has no `id` column locally (composite key on menuItemId+modifierGroupId),
    // so it needs its own onConflict target instead of the default 'id'.
    //
    // Object key order below is also the upsert order, and it matters: each table must come
    // after every table it has a foreign key into (e.g. menuItems references taxRules, so
    // taxRules must be upserted first) or the insert fails on a missing FK target. This is NOT
    // the same order syncService.ts happens to collect the data in on the client — that order
    // only reflects independent SELECT queries and has no FK constraints to respect.
    const TABLE_MAP: Record<string, { table: string; conflictTarget: string }> = {
      restaurants: { table: 'restaurants', conflictTarget: 'id' },
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
      diningTables: { table: 'dining_tables', conflictTarget: 'id' },
      orders: { table: 'orders', conflictTarget: 'id' },
      orderItems: { table: 'order_items', conflictTarget: 'id' },
      orderItemModifiers: { table: 'order_item_modifiers', conflictTarget: 'id' },
      discounts: { table: 'discounts', conflictTarget: 'id' },
      payments: { table: 'payments', conflictTarget: 'id' },
      auditLogs: { table: 'audit_logs', conflictTarget: 'id' },
    };

    const toSnakeCase = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const rowToSnakeCase = (row: Record<string, unknown>) => {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        result[toSnakeCase(key)] = value;
      }
      return result;
    };

    for (const [jsKey, { table: pgTable, conflictTarget }] of Object.entries(TABLE_MAP)) {
      const rows = (syncData[jsKey] as Record<string, unknown>[]) || [];
      pushedCounts[jsKey] = 0;

      for (const row of rows) {
        // Remove changedAt (local diffing field, not a real column)
        const { changedAt: _changedAt, ...cleanRow } = row;
        const snakeRow = rowToSnakeCase(cleanRow);

        // Stamp restaurant_id for filtering — except on the restaurants table itself, which
        // IS the restaurant record and has no such column (it doesn't reference itself).
        // Every other synced table gets it uniformly, including junction tables that don't
        // have it locally, for RLS/isolation defense-in-depth.
        const rowWithRestaurant = jsKey === 'restaurants' ? snakeRow : { ...snakeRow, restaurant_id: restaurantId };

        // Upsert (insert or update)
        const { error } = await supabase.from(pgTable).upsert(rowWithRestaurant, {
          onConflict: conflictTarget,
        });

        if (error) {
          console.error(`Error upserting ${pgTable}:`, error);
          throw error;
        }

        pushedCounts[jsKey]++;
      }
    }

    // Update last_synced_at
    await supabase
      .from('restaurants')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', restaurantId);

    res.json({
      success: true,
      syncedAt: new Date().toISOString(),
      pushedCounts,
    } as SyncResponse);
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

app.listen(PORT, () => {
  console.log(`POS API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Sync endpoint: POST http://localhost:${PORT}/sync`);
});
