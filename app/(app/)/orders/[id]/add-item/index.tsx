import { useState, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listCategories } from '@/features/menu/categoryService';
import { listItems } from '@/features/menu/itemService';
import { listCombos } from '@/features/menu/comboService';

interface MenuItem {
  type: 'item';
  id: string;
  name: string;
  price: number;
}

interface ComboItem {
  type: 'combo';
  id: string;
  name: string;
  price: number;
}

type SelectableItem = MenuItem | ComboItem;

export default function AddItemSelectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const combosQuery = useQuery({
    queryKey: ['combos', restaurantId],
    queryFn: () => listCombos(restaurantId),
  });

  const selectableItems: SelectableItem[] = useMemo(() => {
    const items: SelectableItem[] = [
      ...(itemsQuery.data ?? []).map((item) => ({
        type: 'item' as const,
        id: item.id,
        name: item.name,
        price: item.price,
      })),
    ];

    if (activeCategoryId === null || activeCategoryId === 'combos') {
      items.push(
        ...(combosQuery.data ?? []).map((combo) => ({
          type: 'combo' as const,
          id: combo.id,
          name: combo.name,
          price: combo.price,
        })),
      );
    }

    return items;
  }, [itemsQuery.data, combosQuery.data, activeCategoryId]);

  const handleSelectItem = (item: SelectableItem) => {
    if (item.type === 'combo') {
      router.push({
        pathname: `/orders/[id]/add-combo/[comboDealId]`,
        params: { id, comboDealId: item.id },
      });
    } else {
      router.push({
        pathname: `/orders/[id]/add-item/[menuItemId]`,
        params: { id, menuItemId: item.id },
      });
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        horizontal
        data={categoriesQuery.data ?? []}
        keyExtractor={(c) => c.id}
        style={styles.categoryList}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
        showsHorizontalScrollIndicator={false}
        ListFooterComponent={
          <Pressable style={styles.categoryChip} onPress={() => setSelectedCategoryId('combos')}>
            <Text style={[styles.categoryChipText, selectedCategoryId === 'combos' && styles.categoryChipTextActive]}>
              Combos
            </Text>
          </Pressable>
        }
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
        data={selectableItems}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.itemList}
        ListEmptyComponent={<Text style={styles.empty}>No items available.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.itemRow} onPress={() => handleSelectItem(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
              {item.type === 'combo' && <Text style={styles.comboLabel}>Combo Deal</Text>}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  categoryList: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ddd' },
  categoryChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
  },
  categoryChipActive: { backgroundColor: '#2563eb' },
  categoryChipText: { color: '#333', fontWeight: '600', fontSize: 13 },
  categoryChipTextActive: { color: '#fff' },
  itemList: { padding: 12, gap: 8 },
  itemRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemName: { fontSize: 15, fontWeight: '600', color: '#000' },
  itemPrice: { fontSize: 13, color: '#666', marginTop: 4 },
  comboLabel: { fontSize: 11, color: '#2563eb', fontWeight: '500', marginTop: 2 },
  empty: { textAlign: 'center', color: '#999', marginTop: 20 },
});
