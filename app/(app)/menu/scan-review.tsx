import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { useMenuScanStore } from '@/store/menuScanStore';
import { createCategory, listCategories } from '@/features/menu/categoryService';
import { createItem } from '@/features/menu/itemService';
import { Button } from '@/components/Button';

export default function MenuScanReviewScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
  const { drafts, updateDraft, clear } = useMenuScanStore();
  const [isSaving, setIsSaving] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => listCategories(restaurantId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      setIsSaving(true);
      const existingCategories = categoriesQuery.data ?? [];
      const categoryIdByName = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c.id]));

      for (const draft of drafts) {
        if (!draft.include) continue;

        const categoryName = draft.guessedCategoryName?.trim() || 'General';
        let categoryId = categoryIdByName.get(categoryName.toLowerCase());
        if (!categoryId) {
          categoryId = await createCategory({ restaurantId, name: categoryName });
          categoryIdByName.set(categoryName.toLowerCase(), categoryId);
        }

        await createItem({
          restaurantId,
          categoryId,
          name: draft.name,
          price: draft.price,
        });
      }
    },
    onSuccess: () => {
      clear();
      queryClient.invalidateQueries({ queryKey: ['categories', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['items', restaurantId] });
      router.dismissTo('/menu');
    },
    onSettled: () => setIsSaving(false),
  });

  const includedCount = drafts.filter((d) => d.include).length;

  if (drafts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.empty}>No scanned items to review. Scan a menu first.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Review extracted items</Text>
      <Text style={styles.subtitle}>Edit or exclude anything before saving to your menu.</Text>

      {drafts.map((draft, index) => (
        <View key={index} style={styles.row}>
          <Switch value={draft.include} onValueChange={(include) => updateDraft(index, { include })} />
          <View style={styles.fields}>
            <TextInput
              style={styles.nameInput}
              value={draft.name}
              onChangeText={(name) => updateDraft(index, { name })}
            />
            <View style={styles.metaRow}>
              <TextInput
                style={styles.priceInput}
                value={String(draft.price)}
                keyboardType="decimal-pad"
                onChangeText={(text) => updateDraft(index, { price: parseFloat(text) || 0 })}
              />
              <TextInput
                style={styles.categoryInput}
                value={draft.guessedCategoryName ?? ''}
                placeholder="Category"
                onChangeText={(guessedCategoryName) => updateDraft(index, { guessedCategoryName })}
              />
            </View>
          </View>
        </View>
      ))}

      <Button
        label={isSaving ? 'Saving…' : `Save ${includedCount} item${includedCount === 1 ? '' : 's'} to menu`}
        onPress={() => saveMutation.mutate()}
        disabled={includedCount === 0 || isSaving}
        style={styles.saveButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#999' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#666', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  fields: { flex: 1 },
  nameInput: { fontSize: 16, fontWeight: '600', paddingVertical: 4 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  priceInput: { fontSize: 14, color: '#333', width: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  categoryInput: { fontSize: 14, color: '#333', flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  saveButton: { marginTop: 20 },
});
