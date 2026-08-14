import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function AppLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const tablesEnabled = useAuthStore((s) => s.restaurant?.tablesEnabled ?? true);

  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="orders" options={{ title: 'Billing', headerShown: false }} />
      <Tabs.Screen
        name="tables"
        options={{ title: 'Tables', headerShown: false, href: tablesEnabled ? undefined : null }}
      />
      <Tabs.Screen name="menu" options={{ title: 'Menu', headerShown: false }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports', headerShown: false }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', headerShown: false }} />
    </Tabs>
  );
}
