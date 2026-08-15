import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLogs } from '@/db/schema';
import { generateId } from '@/lib/id';

export type AuditLog = typeof auditLogs.$inferSelect;

export interface LogAuditInput {
  restaurantId: string;
  staffId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    id: generateId(),
    restaurantId: input.restaurantId,
    staffId: input.staffId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    beforeJson: input.before !== undefined ? JSON.stringify(input.before) : undefined,
    afterJson: input.after !== undefined ? JSON.stringify(input.after) : undefined,
  });
}

export async function listAuditLogs(restaurantId: string): Promise<AuditLog[]> {
  return db.query.auditLogs.findMany({
    where: eq(auditLogs.restaurantId, restaurantId),
    orderBy: (l, { desc }) => desc(l.createdAt),
  });
}
