import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listCategories } from '@/features/menu/categoryService';
import { listItems, type MenuItem } from '@/features/menu/itemService';
import { getModifierGroupsForItem } from '@/features/menu/modifierService';
import { listCombos, type ComboDealWithItems } from '@/features/menu/comboService';
import { addItemToOrder, getOrder, parkOrder } from '@/features/orders/orderService';
import { Button } from '@/components/Button';

const COMBOS_CATEGORY_ID = '__combos__';

export default function OrderItemPickerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const categoriesQuery = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => listCategories(restaurantId),
  });
  const activeCategoryId = selectedCategoryId ?? categoriesQuery.data?.[0]?.id ?? null;
  const showingCombos = activeCategoryId === COMBOS_CATEGORY_ID;

  const itemsQuery = useQuery({
    queryKey: ['items', restaurantId, activeCategoryId],
    queryFn: () => listItems(restaurantId, activeCategoryId ?? undefined),
    enabled: !!activeCategoryId && !showingCombos,
  });

  const combosQuery = useQuery({
    queryKey: ['combos', restaurantId],
    queryFn: () => listCombos(restaurantId),
    enabled: showingCombos,
  });

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
    refetchInterval: 2000,
  });

  const visibleItems = useMemo(() => {
    const items = itemsQuery.data ?? [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [itemsQuery.data, search]);

  const visibleCombos = useMemo(() => {
    const combos = combosQuery.data ?? [];
    if (!search.trim()) return combos;
    const q = search.trim().toLowerCase();
    return combos.filter((c) => c.name.toLowerCase().includes(q));
  }, [combosQuery.data, search]);

  const invalidateOrder = () => queryClient.invalidateQueries({ queryKey: ['order', id] });

  const quickAddMutation = useMutation({
    mutationFn: (menuItem: MenuItem) => addItemToOrder(id, { menuItemId: menuItem.id, quantity: 1 }),
    onSuccess: invalidateOrder,
  });

  const parkMutation = useMutation({
    mutationFn: () => parkOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openOrders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['parkedOrders', restaurantId] });
      router.replace('/orders');
    },
  });

  async function onItemPress(item: MenuItem) {
    if (item.isOutOfStock) return;
    const groups = await getModifierGroupsForItem(item.id);
    if (groups.length > 0) {
      router.push(`/orders/${id}/add-item/${item.id}`);
    } else {
      quickAddMutation.mutate(item);
    }
  }

  function onComboPress(combo: ComboDealWithItems) {
    router.push(`/orders/${id}/add-combo/${combo.id}`);
  }

  const itemCount = orderQuery.data?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const grandTotal = orderQuery.data?.grandTotal ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.headerActions}>
        <Button label="Hold / Park" variant="secondary" onPress={() => parkMutation.mutate()} style={{ flex: 1 }} />
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search items"
        value={search}
        onChangeText={setSearch}
        placeholderTextColor="#999"
      />

      <FlatList
        horizontal
        data={categoriesQuery.data ?? []}
        keyExtractor={(c) => c.id}
        style={styles.categoryList}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}
        showsHorizontalScrollIndicator={false}
        ListFooterComponent={
          <Pressable
            onPress={() => setSelectedCategoryId(COMBOS_CATEGORY_ID)}
            style={[styles.categoryChip, showingCombos && styles.categoryChipActive]}
          >
            <Text style={[styles.categoryChipText, showingCombos && styles.categoryChipTextActive]}>Combos</Text>
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

      {showingCombos ? (
        <FlatList
          data={visibleCombos}
          keyExtractor={(c) => c.id}
          numColumns={2}
          contentContainerStyle={styles.itemGrid}
          columnWrapperStyle={{ gap: 10 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No combos available.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.itemCard} onPress={() => onComboPress(item)}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
              <Text style={styles.comboBadge}>Combo</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(i) => i.id}
          numColumns={2}
          contentContainerStyle={styles.itemGrid}
          columnWrapperStyle={{ gap: 10 }}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.itemCard, item.isOutOfStock && styles.itemCardDisabled]}
              onPress={() => onItemPress(item)}
              disabled={item.isOutOfStock}
            >
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>
                {item.isOutOfStock ? 'Out of stock' : `₹${item.price.toFixed(2)}`}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Pressable style={styles.cartBar} onPress={() => router.push(`/orders/${id}/cart`)}>
        <Text style={styles.cartBarText}>
          {itemCount} item{itemCount === 1 ? '' : 's'} · ₹{grandTotal.toFixed(2)}
        </Text>
        <Text style={styles.cartBarAction}>View bill →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  search: {
    marginHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  categoryList: { flexGrow: 0, marginVertical: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  categoryChipActive: { backgroundColor: '#2563eb' },
  categoryChipText: { color: '#333', fontWeight: '600' },
  categoryChipTextActive: { color: 'white' },
  itemGrid: { paddingHorizontal: 12, paddingBottom: 80, gap: 10 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
  comboBadge: { fontSize: 10, color: '#2563eb', fontWeight: '600', marginTop: 4 },
  itemCard: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    minHeight: 84,
    justifyContent: 'center',
  },
  itemCardDisabled: { opacity: 0.4 },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemPrice: { fontSize: 13, color: '#666', marginTop: 4 },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartBarText: { color: 'white', fontWeight: '700', fontSize: 15 },
  cartBarAction: { color: 'white', fontWeight: '600' },
});
