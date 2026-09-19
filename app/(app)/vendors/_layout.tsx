import { Stack } from 'expo-router';

export default function VendorsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Vendors' }} />
      <Stack.Screen name="[id]" options={{ title: 'Vendor', presentation: 'modal' }} />
    </Stack>
  );
}
