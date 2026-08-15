import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="business-details" options={{ title: 'Business Details' }} />
      <Stack.Screen name="tax-rules" options={{ title: 'Tax Rules' }} />
      <Stack.Screen name="staff/index" options={{ title: 'Staff' }} />
      <Stack.Screen name="staff/[id]" options={{ title: 'Staff Member', presentation: 'modal' }} />
      <Stack.Screen name="audit-log" options={{ title: 'Audit Log' }} />
      <Stack.Screen name="sync" options={{ title: 'Sync' }} />
    </Stack>
  );
}
