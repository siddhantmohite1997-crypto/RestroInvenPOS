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

/** The one place any code in this app changes inventory quantity. Applies the change to local
 * SQLite and queues it for the server in ONE transaction, then returns -- what the caller awaits
 * is purely local work, never a network round-trip.
 *
 * That last part is a hard requirement, not an optimisation. Every caller on the till's critical
 * path (addItemToOrder, cancelOrder's per-item restore loop, purchase entry) awaits this once per
 * line item, sequentially. When this function awaited the live HTTP call, a reachable-but-
 * unresponsive connection -- a captive portal, a hanging server: the failure mode that fails
 * slowly rather than fast -- stalled each of those awaits for the platform's default socket
 * timeout, multiplied by the number of items in the loop. Taking an order must never be blocked
 * by network conditions, so delivery is structurally decoupled from the caller's await below.
 *
 * Every call queues a pending_inventory_deltas row unconditionally (not only on failure): the
 * row is the durable record of "the server still owes this change", and
 * flushPendingInventoryDeltas is the single code path that delivers one and marks it synced. The
 * fire-and-forget flush kicked off here keeps the common online case prompt -- it typically
 * delivers this very row a moment later -- but nothing about its outcome is awaited, so a slow
 * network can only ever delay the flush, never the till. */
export async function adjustStock(input: AdjustStockInput): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.delta !== undefined) {
      await tx
        .update(inventoryItems)
        .set({
          quantity: sql`ROUND(${inventoryItems.quantity} + ${input.delta}, 3)`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItems.id, input.inventoryItemId));
    } else if (input.setAbsolute !== undefined) {
      await tx
        .update(inventoryItems)
        .set({ quantity: input.setAbsolute, updatedAt: new Date() })
        .where(eq(inventoryItems.id, input.inventoryItemId));
    }

    await tx.insert(pendingInventoryDeltas).values({
      id: generateId(),
      restaurantId: input.restaurantId,
      inventoryItemId: input.inventoryItemId,
      delta: input.delta ?? null,
      setAbsolute: input.setAbsolute ?? null,
      reason: input.reason,
    });
  });

  // Deliberately not awaited, and deliberately never allowed to reject: see the doc comment.
  void flushPendingInventoryDeltas(input.restaurantId, input.pin).catch(() => {});
}

/** Serializes every flush, from whatever caller: the periodic tick, and now one per adjustStock
 * call. Two flushes must never overlap -- both would read the same still-unsynced row (the
 * first has not marked it synced yet, since that only happens after its own HTTP call returns)
 * and both would POST it, applying the same delta to the server twice. That is the exact
 * silent double-count this whole area exists to prevent, so the flushes queue up behind each
 * other instead. Rejections are absorbed into the chain's continuation so one failure can never
 * strand every later flush. */
let flushChain: Promise<void> = Promise.resolve();

export function flushPendingInventoryDeltas(restaurantId: string, pin: string): Promise<void> {
  const next = flushChain.then(
    () => flushPendingInventoryDeltasInternal(restaurantId, pin),
    () => flushPendingInventoryDeltasInternal(restaurantId, pin),
  );
  flushChain = next.catch(() => {});
  return next;
}

/** Retries every unsynced queued delta, oldest first, against the live endpoint -- called from
 * usePeriodicSync's tick alongside the generic pull, so it piggybacks on the same 2-minute
 * cadence rather than running its own timer, and (best-effort, never awaited) from adjustStock
 * itself so the common online case still delivers promptly. A row that still fails stays queued
 * for the next tick; one that succeeds is marked synced (never deleted, so a device's own
 * history of what it queued and when stays inspectable if something needs debugging later). */
async function flushPendingInventoryDeltasInternal(restaurantId: string, pin: string): Promise<void> {
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
