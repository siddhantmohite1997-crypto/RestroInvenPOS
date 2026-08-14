import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="business-details" options={{ title: 'Business Details' }} />
      <Stack.Screen name="tax-rules" options={{ title: 'Tax Rules' }} />
    </Stack>
  );
}
