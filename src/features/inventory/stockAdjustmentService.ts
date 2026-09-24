import { eq, isNull, sql } from 'drizzle-orm';
import Constants from 'expo-constants';
import { db } from '@/db/client';
import { inventoryItems, pendingInventoryDeltas } from '@/db/schema';
import { generateId } from '@/lib/id';

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
