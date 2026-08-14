import { Stack } from 'expo-router';

export default function OrdersLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Billing' }} />
      <Stack.Screen name="new" options={{ title: 'New Order', presentation: 'modal' }} />
      <Stack.Screen name="parked" options={{ title: 'Parked Bills' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Order' }} />
      <Stack.Screen name="[id]/cart" options={{ title: 'Bill' }} />
      <Stack.Screen name="[id]/discount" options={{ title: 'Discount', presentation: 'modal' }} />
      <Stack.Screen name="[id]/payment" options={{ title: 'Payment', presentation: 'modal' }} />
      <Stack.Screen
        name="[id]/add-item/[menuItemId]"
        options={{ title: 'Choose Options', presentation: 'modal' }}
      />
    </Stack>
  );
}
