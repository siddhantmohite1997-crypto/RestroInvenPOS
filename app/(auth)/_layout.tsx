import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AuthLayout() {
  const restaurant = useAuthStore((s) => s.restaurant);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  if (isHydrated && !restaurant) {
    return <Redirect href="/(setup)/welcome" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
