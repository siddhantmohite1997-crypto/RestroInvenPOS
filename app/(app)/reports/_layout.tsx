import { Stack } from 'expo-router';

export default function ReportsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Reports' }} />
      <Stack.Screen name="item-sales" options={{ title: 'Item-wise Sales' }} />
    </Stack>
  );
}
