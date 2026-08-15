import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPin } from './pin';

export type AuthenticatedUser = typeof users.$inferSelect;

/**
 * PIN entry doesn't ask for a username first — it scans active staff for the current
 * restaurant and finds whichever one the PIN matches, like most restaurant POS PIN pads.
 */
export async function authenticateByPin(
  restaurantId: string,
  pin: string,
): Promise<AuthenticatedUser | null> {
  const candidates = await db.query.users.findMany({
    where: (u, { and, eq: eqOp }) =>
      and(eqOp(u.restaurantId, restaurantId), eqOp(u.isActive, true)),
  });

  for (const candidate of candidates) {
    if (await verifyPin(pin, candidate.pinSalt, candidate.pinHash)) {
      return candidate;
    }
  }
  return null;
}

export async function getUserById(id: string): Promise<AuthenticatedUser | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, id) });
  return row ?? null;
}

/** Same PIN-scan approach as authenticateByPin, restricted to owner/admin — used for override prompts. */
export async function authenticateManagerPin(
  restaurantId: string,
  pin: string,
): Promise<AuthenticatedUser | null> {
  const candidates = await db.query.users.findMany({
    where: (u, { and, eq: eqOp, inArray }) =>
      and(eqOp(u.restaurantId, restaurantId), eqOp(u.isActive, true), inArray(u.role, ['owner', 'admin'])),
  });

  for (const candidate of candidates) {
    if (await verifyPin(pin, candidate.pinSalt, candidate.pinHash)) {
      return candidate;
    }
  }
  return null;
}
