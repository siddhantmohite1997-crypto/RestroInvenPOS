import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { formatQuantity, listInventoryItems } from '@/features/inventory/inventoryService';
import { Button } from '@/components/Button';

export default function InventoryScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const itemsQuery = useQuery({
    queryKey: ['inventoryItems', restaurantId],
    queryFn: () => listInventoryItems(restaurantId),
  });

  // This tab stays mounted in the background when switching tabs (React Navigation doesn't
  // unmount bottom-tab screens by default), so without this, quantities deducted by a Billing
  // order placed on another tab never show up here until the app restarts. Re-fetch every time
  // the tab actually comes into view instead.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems', restaurantId] });
    }, [queryClient, restaurantId]),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={itemsQuery.data ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.itemList}
        ListEmptyComponent={<Text style={styles.empty}>No inventory items yet.</Text>}
        renderItem={({ item }) => {
          const isLowStock = item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold;
          return (
            <Pressable style={styles.itemRow} onPress={() => router.push(`/inventory/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemQuantity}>
                  {formatQuantity(item.quantity)} {item.unit}
                </Text>
              </View>
              {isLowStock && (
                <View style={styles.lowStockBadge}>
                  <Text style={styles.lowStockBadgeText}>Low stock</Text>
                </View>
              )}
            </Pressable>
          );
        }}
      />

      <Button label="+ Add Item" onPress={() => router.push('/inventory/new')} style={styles.addItemButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  itemList: { padding: 12, paddingBottom: 90, gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemQuantity: { fontSize: 14, color: '#666', marginTop: 2 },
  lowStockBadge: { backgroundColor: '#fde8e8', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  lowStockBadgeText: { color: '#c0392b', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  addItemButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
