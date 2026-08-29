import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const currentUser = useAuthStore((s) => s.currentUser);
  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }
  // Owner has no Billing tab (see app/(app)/_layout.tsx) -- same reasoning as login.tsx's redirect.
  return <Redirect href={currentUser.role === 'owner' ? '/(app)/menu' : '/(app)/orders'} />;
}
