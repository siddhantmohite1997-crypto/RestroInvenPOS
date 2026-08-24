import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { syncLogs } from '@/db/schema';
import { generateId } from '@/lib/id';

export type SyncLog = typeof syncLogs.$inferSelect;

export interface LogSyncAttemptInput {
  restaurantId: string;
  triggeredBy: 'manual' | 'auto';
  status: 'success' | 'error';
  message?: string;
  pushedCounts?: Record<string, number>;
  startedAt: Date;
}

export async function logSyncAttempt(input: LogSyncAttemptInput): Promise<void> {
  await db.insert(syncLogs).values({
    id: generateId(),
    restaurantId: input.restaurantId,
    triggeredBy: input.triggeredBy,
    status: input.status,
    message: input.message,
    pushedCountsJson: input.pushedCounts ? JSON.stringify(input.pushedCounts) : null,
    startedAt: input.startedAt,
    finishedAt: new Date(),
  });
}

export async function listRecentSyncLogs(restaurantId: string, limit = 10): Promise<SyncLog[]> {
  return db.query.syncLogs.findMany({
    where: eq(syncLogs.restaurantId, restaurantId),
    orderBy: desc(syncLogs.startedAt),
    limit,
  });
}
