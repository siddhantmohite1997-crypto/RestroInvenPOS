import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPin, hashPinForCloud, createSalt, hashPin } from './pin';

export type AuthenticatedUser = typeof users.$inferSelect;

/** A staff row restored from the cloud (see restoreFromCloud in setupService.ts) has no usable
 * local pinHash yet -- only a cloudPinHash bridge. On a match, upgrade it to a real salted
 * pinHash/pinSalt so every login after the first one goes through the normal fast path. */
async function tryCloudPinFallback(
  candidate: AuthenticatedUser,
  pin: string,
): Promise<AuthenticatedUser | null> {
  if (!candidate.cloudPinHash) return null;
  const cloudHash = await hashPinForCloud(pin);
  if (cloudHash !== candidate.cloudPinHash) return null;

  const pinSalt = await createSalt();
  const pinHash = await hashPin(pin, pinSalt);
  await db
    .update(users)
    .set({ pinHash, pinSalt, cloudPinHash: null, updatedAt: new Date() })
    .where(eq(users.id, candidate.id));
  return { ...candidate, pinHash, pinSalt, cloudPinHash: null };
}

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
    const upgraded = await tryCloudPinFallback(candidate, pin);
    if (upgraded) return upgraded;
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
    const upgraded = await tryCloudPinFallback(candidate, pin);
    if (upgraded) return upgraded;
  }
  return null;
}
