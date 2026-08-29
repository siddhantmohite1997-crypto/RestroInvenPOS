import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listCategories } from '@/features/menu/categoryService';
import { listItems } from '@/features/menu/itemService';
import { countIngredientsByMenuItem } from '@/features/inventory/inventoryService';

export default function RecipesScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => listCategories(restaurantId),
  });

  const activeCategoryId = selectedCategoryId ?? categoriesQuery.data?.[0]?.id ?? null;

  const itemsQuery = useQuery({
    queryKey: ['items', restaurantId, activeCategoryId],
    queryFn: () => listItems(restaurantId, activeCategoryId ?? undefined),
    enabled: !!activeCategoryId,
  });

  const ingredientCountsQuery = useQuery({
    queryKey: ['recipeIngredientCounts', restaurantId],
    queryFn: () => countIngredientsByMenuItem(restaurantId),
  });

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={categoriesQuery.data ?? []}
        keyExtractor={(c) => c.id}
        style={styles.categoryList}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedCategoryId(item.id)}
            style={[styles.categoryChip, activeCategoryId === item.id && styles.categoryChipActive]}
          >
            <Text style={[styles.categoryChipText, activeCategoryId === item.id && styles.categoryChipTextActive]}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />

      <FlatList
        data={itemsQuery.data ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.itemList}
        ListEmptyComponent={
          activeCategoryId ? <Text style={styles.empty}>No items in this category yet.</Text> : null
        }
        renderItem={({ item }) => {
          const count = ingredientCountsQuery.data?.[item.id] ?? 0;
          return (
            <Pressable style={styles.itemRow} onPress={() => router.push(`/recipes/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
              </View>
              <View style={[styles.badge, count === 0 && styles.badgeUnlinked]}>
                <Text style={[styles.badgeText, count === 0 && styles.badgeTextUnlinked]}>
                  {count === 0 ? 'Not linked' : `${count} ingredient${count === 1 ? '' : 's'}`}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  categoryList: { flexGrow: 0, marginTop: 12, marginBottom: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  categoryChipActive: { backgroundColor: '#2563eb' },
  categoryChipText: { color: '#333', fontWeight: '600' },
  categoryChipTextActive: { color: 'white' },
  itemList: { paddingHorizontal: 12, paddingBottom: 24, gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemPrice: { fontSize: 14, color: '#666', marginTop: 2 },
  badge: { backgroundColor: '#e6f4ea', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeUnlinked: { backgroundColor: '#eee' },
  badgeText: { color: '#1e7b34', fontSize: 12, fontWeight: '600' },
  badgeTextUnlinked: { color: '#888' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
