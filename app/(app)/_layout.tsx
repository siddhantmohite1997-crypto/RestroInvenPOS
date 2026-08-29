import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { useSyncGate } from '@/features/sync/useSyncGate';

export default function AppLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const tablesEnabled = useAuthStore((s) => s.restaurant?.tablesEnabled ?? true);

  useSyncGate();

  if (!currentUser) {
    return <Redirect href="/(auth)/login" />;
  }

  // Owner/Captain/Waiter tab visibility. `admin` is labeled "Captain" and `cashier` is
  // labeled "Waiter" throughout the UI — see the comment on StaffRole in permissions.ts.
  // Owner is back-office focused (no Billing/Tables); Waiter is floor-focused (no
  // Inventory/Recipes/Reports). Settings itself stays visible to everyone — its content is
  // what's stripped down per role, since Captain/Waiter still need a way to log out.
  const isOwner = currentUser.role === 'owner';
  const isWaiter = currentUser.role === 'cashier';
  const showBillingAndTables = !isOwner;
  const showInventoryAndRecipes = !isWaiter;
  const showReports = isOwner;

  return (
    <Tabs screenOptions={{ headerShown: true }} initialRouteName={isOwner ? 'menu' : 'orders'}>
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Billing',
          headerShown: false,
          href: showBillingAndTables ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tables"
        options={{
          title: 'Tables',
          headerShown: false,
          href: showBillingAndTables && tablesEnabled ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          headerShown: false,
          href: showInventoryAndRecipes ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          headerShown: false,
          href: showInventoryAndRecipes ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          headerShown: false,
          href: showReports ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
