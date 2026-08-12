import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AppLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);

  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="orders/index" options={{ title: 'Billing' }} />
      <Tabs.Screen name="tables/index" options={{ title: 'Tables' }} />
      <Tabs.Screen name="menu/index" options={{ title: 'Menu' }} />
      <Tabs.Screen name="reports/index" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings/index" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
