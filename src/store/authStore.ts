import { create } from 'zustand';
import { db } from '@/db/client';
import type { AuthenticatedUser } from '@/features/auth/authService';
import { authenticateByPin } from '@/features/auth/authService';

type Restaurant = Awaited<ReturnType<typeof db.query.restaurants.findFirst>>;

interface AuthState {
  restaurant: Restaurant | null;
  currentUser: AuthenticatedUser | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  restaurant: null,
  currentUser: null,
  isHydrated: false,

  hydrate: async () => {
    const restaurant = await db.query.restaurants.findFirst();
    set({ restaurant: restaurant ?? null, isHydrated: true });
  },

  login: async (pin: string) => {
    const restaurant = get().restaurant;
    if (!restaurant) return false;
    const user = await authenticateByPin(restaurant.id, pin);
    if (!user) return false;
    set({ currentUser: user });
    return true;
  },

  logout: () => set({ currentUser: null }),
}));
