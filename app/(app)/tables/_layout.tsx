import { Stack } from 'expo-router';

export default function TablesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Tables' }} />
    </Stack>
  );
}
