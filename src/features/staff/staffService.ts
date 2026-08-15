import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { generateId } from '@/lib/id';
import { createSalt, hashPin } from '@/features/auth/pin';
import type { StaffRole } from '@/features/auth/permissions';

export type StaffMember = typeof users.$inferSelect;

export async function listStaff(restaurantId: string): Promise<StaffMember[]> {
  return db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.restaurantId, restaurantId),
    orderBy: (u, { asc }) => asc(u.name),
  });
}

export interface CreateStaffInput {
  restaurantId: string;
  name: string;
  role: StaffRole;
  pin: string;
}

export async function createStaff(input: CreateStaffInput): Promise<string> {
  const id = generateId();
  const salt = await createSalt();
  const pinHash = await hashPin(input.pin, salt);
  await db.insert(users).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    role: input.role,
    pinHash,
    pinSalt: salt,
    isActive: true,
  });
  return id;
}

export interface UpdateStaffInput {
  name?: string;
  role?: StaffRole;
  isActive?: boolean;
  /** Set to change the PIN; omit to leave it unchanged. */
  pin?: string;
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<void> {
  const { pin, ...rest } = input;
  const updates: Partial<typeof users.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (pin) {
    const salt = await createSalt();
    updates.pinHash = await hashPin(pin, salt);
    updates.pinSalt = salt;
  }
  await db.update(users).set(updates).where(eq(users.id, id));
}
