import { Stack } from 'expo-router';

export default function RecipesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Recipes' }} />
      <Stack.Screen name="[menuItemId]" options={{ title: 'Ingredients', presentation: 'modal' }} />
    </Stack>
  );
}
