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
    return { valid: false, reason: 'Invalid PIN' };
  }

  return { valid: true };
}

// ============================================================================
// SYNC ENDPOINT
// ============================================================================

app.post('/sync', async (req: Request, res: Response) => {
  try {
    const { restaurantId, pin, syncData } = req.body as SyncRequest;

    if (!restaurantId || !pin) {
      return res.status(400).json({ error: 'restaurantId and pin required' });
    }

    // Verify PIN and restaurant
    const auth = await verifyPinAuth(restaurantId, pin);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.reason || 'Authentication failed' });
    }

    // Sync data
    const pushedCounts: Record<string, number> = {};

    // Tables to sync (in dependency order)
    const tables = [
      'restaurants',
      'categories',
      'menu_items',
      'modifier_groups',
      'modifiers',
      'menu_item_modifier_groups',
      'tax_rules',
      'tax_components',
      'combo_deals',
      'combo_deal_items',
      'dining_tables',
      'orders',
      'order_items',
      'order_item_modifiers',
      'discounts',
      'payments',
      'audit_logs',
    ];

    for (const table of tables) {
      const rows = (syncData[table] as any[]) || [];
      pushedCounts[table] = 0;

      for (const row of rows) {
        // Don't sync staff PINs to this table (already stored separately)
        if (table === 'staff') {
          continue;
        }

        // Remove changedAt (local diffing field)
        const { changedAt: _changedAt, ...cleanRow } = row as any;

        // Add restaurant_id for filtering
        const rowWithRestaurant = {
          ...cleanRow,
          restaurant_id: restaurantId,
        };

        // Upsert (insert or update)
        const { error } = await supabase.from(table).upsert(rowWithRestaurant, {
          onConflict: 'id',
        });

        if (error) {
          console.error(`Error upserting ${table}:`, error);
          throw error;
        }

        pushedCounts[table]++;
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
