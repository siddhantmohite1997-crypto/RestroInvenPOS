import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listCategories } from '@/features/menu/categoryService';
import { listItems, setOutOfStock } from '@/features/menu/itemService';
import { Button } from '@/components/Button';

export default function MenuScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();
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

  const toggleOutOfStock = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) => setOutOfStock(id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items', restaurantId] }),
  });

  return (
    <View style={styles.container}>
      <View style={styles.topActions}>
        <Button label="Modifiers" variant="secondary" onPress={() => router.push('/menu/modifiers')} />
        <Button label="Combos" variant="secondary" onPress={() => router.push('/menu/combos')} />
        <Button label="Scan Menu" variant="secondary" onPress={() => router.push('/menu/scan')} />
      </View>

      <FlatList
        horizontal
        data={categoriesQuery.data ?? []}
        keyExtractor={(c) => c.id}
        style={styles.categoryList}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
        showsHorizontalScrollIndicator={false}
        ListFooterComponent={
          <Pressable style={styles.categoryChipAdd} onPress={() => router.push('/menu/category/new')}>
            <Text style={styles.categoryChipAddText}>+ Category</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedCategoryId(item.id)}
            onLongPress={() => router.push(`/menu/category/${item.id}`)}
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
        renderItem={({ item }) => (
          <Pressable style={styles.itemRow} onPress={() => router.push(`/menu/item/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
            </View>
            <View style={styles.outOfStockRow}>
              <Text style={styles.outOfStockLabel}>{item.isOutOfStock ? 'Out of stock' : 'In stock'}</Text>
              <Switch
                value={!item.isOutOfStock}
                onValueChange={(inStock) =>
                  toggleOutOfStock.mutate({ id: item.id, value: !inStock })
                }
              />
            </View>
          </Pressable>
        )}
      />

      <Button
        label="+ Add Item"
        onPress={() =>
          router.push(activeCategoryId ? `/menu/item/new?categoryId=${activeCategoryId}` : '/menu/item/new')
        }
        style={styles.addItemButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topActions: { flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap' },
  categoryList: { flexGrow: 0, marginBottom: 8 },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
  },
  categoryChipActive: { backgroundColor: '#2563eb' },
  categoryChipText: { color: '#333', fontWeight: '600' },
  categoryChipTextActive: { color: 'white' },
  categoryChipAdd: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderStyle: 'dashed',
  },
  categoryChipAddText: { color: '#2563eb', fontWeight: '600' },
  itemList: { paddingHorizontal: 12, paddingBottom: 90, gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemPrice: { fontSize: 14, color: '#666', marginTop: 2 },
  outOfStockRow: { alignItems: 'center', gap: 4 },
  outOfStockLabel: { fontSize: 11, color: '#666' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  addItemButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
