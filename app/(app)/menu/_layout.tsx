import { Stack } from 'expo-router';

export default function MenuLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Menu' }} />
      <Stack.Screen name="category/[id]" options={{ title: 'Category', presentation: 'modal' }} />
      <Stack.Screen name="item/[id]" options={{ title: 'Item', presentation: 'modal' }} />
      <Stack.Screen name="modifiers/index" options={{ title: 'Modifier Groups' }} />
      <Stack.Screen name="modifiers/[id]" options={{ title: 'Modifier Group', presentation: 'modal' }} />
      <Stack.Screen name="combos/index" options={{ title: 'Combo Deals' }} />
      <Stack.Screen name="combos/[id]" options={{ title: 'Combo Deal', presentation: 'modal' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan Menu', presentation: 'modal' }} />
      <Stack.Screen name="scan-review" options={{ title: 'Review Scanned Items' }} />
    </Stack>
  );
}
