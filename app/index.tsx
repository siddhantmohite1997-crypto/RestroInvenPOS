import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const currentUser = useAuthStore((s) => s.currentUser);
  return <Redirect href={currentUser ? '/(app)/orders' : '/(auth)/login'} />;
}
