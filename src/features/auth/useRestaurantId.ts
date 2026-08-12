import { useAuthStore } from '@/store/authStore';

/** Throws if called before the restaurant is hydrated — only use inside the (app) route group, which requires it. */
export function useRestaurantId(): string {
  const restaurantId = useAuthStore((s) => s.restaurant?.id);
  if (!restaurantId) {
    throw new Error('useRestaurantId called before restaurant was hydrated');
  }
  return restaurantId;
}
