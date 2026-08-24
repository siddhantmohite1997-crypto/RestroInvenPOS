import { create } from 'zustand';
import { db } from '@/db/client';
import type { AuthenticatedUser } from '@/features/auth/authService';
import { authenticateByPin } from '@/features/auth/authService';
import { checkRestaurantStatus } from '@/features/sync/syncService';

type Restaurant = Awaited<ReturnType<typeof db.query.restaurants.findFirst>>;

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'wrong_pin' | 'restaurant_disabled'; message: string };

interface AuthState {
  restaurant: Restaurant | null;
  currentUser: AuthenticatedUser | null;
  /** The PIN just used to log in, held in memory only (never persisted) for the rest of
   * this app session — lets auto-sync (and "Sync Now") authenticate silently without
   * re-prompting every time. Cleared on logout. */
  currentPin: string | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (pin: string) => Promise<LoginResult>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  restaurant: null,
  currentUser: null,
  currentPin: null,
  isHydrated: false,

  hydrate: async () => {
    const restaurant = await db.query.restaurants.findFirst();
    set({ restaurant: restaurant ?? null, isHydrated: true });
  },

  login: async (pin: string) => {
    const restaurant = get().restaurant;
    if (!restaurant) {
      return { ok: false, reason: 'wrong_pin', message: 'Incorrect PIN' };
    }
    const user = await authenticateByPin(restaurant.id, pin);
    if (!user) {
      return { ok: false, reason: 'wrong_pin', message: 'Incorrect PIN' };
    }

    // If we're online, confirm the restaurant hasn't been disabled before letting them
    // in. If we can't reach the server at all, don't block a correct local PIN on that —
    // the next sync attempt (manual or auto) will surface it then.
    const status = await checkRestaurantStatus(restaurant.id, pin);
    if (status.online && status.enabled === false) {
      return {
        ok: false,
        reason: 'restaurant_disabled',
        message: status.reason ?? 'This restaurant has been disabled. Contact your administrator.',
      };
    }

    set({ currentUser: user, currentPin: pin });
    return { ok: true };
  },

  logout: () => set({ currentUser: null, currentPin: null }),
}));
