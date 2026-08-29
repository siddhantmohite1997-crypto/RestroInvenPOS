import { Stack } from 'expo-router';

export default function InventoryLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Inventory' }} />
      <Stack.Screen name="[id]" options={{ title: 'Inventory Item', presentation: 'modal' }} />
    </Stack>
  );
}
