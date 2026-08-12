import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createCategory, deleteCategory, listCategories, updateCategory } from '@/features/menu/categoryService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function CategoryEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => listCategories(restaurantId),
    enabled: !isNew,
  });
  const existing = categoriesQuery.data?.find((c) => c.id === id);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    if (existing) setName(existing.name);
  }, [existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories', restaurantId] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        await createCategory({ restaurantId, name });
      } else {
        await updateCategory(id, { name });
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCategory(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FormField label="Category name" value={name} onChangeText={setName} placeholder="e.g. Starters" />
      <Button label={isNew ? 'Create category' : 'Save changes'} onPress={() => saveMutation.mutate()} disabled={!name.trim()} />
      {!isNew && (
        <Button label="Delete category" variant="danger" onPress={() => deleteMutation.mutate()} style={styles.deleteButton} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  deleteButton: { marginTop: 12 },
});
