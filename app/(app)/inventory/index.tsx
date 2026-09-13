import { useCallback, useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { formatQuantity, listInventoryItems, type InventoryItem } from '@/features/inventory/inventoryService';
import { Button } from '@/components/Button';

const UNCATEGORIZED = 'Other';

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

  // Grouped by category so a long stock list (chicken, goat, pork, paneer, bread, ...) reads as
  // sections (Meat, Dairy, Bakery/Bread, ...) instead of one flat alphabetical wall of names.
  // Uncategorized items -- anything created before this existed, or left blank -- fall under a
  // trailing "Other" section rather than being scattered alphabetically among named ones.
  const sections = useMemo(() => {
    const byCategory = new Map<string, InventoryItem[]>();
    for (const item of itemsQuery.data ?? []) {
      const key = item.category?.trim() || UNCATEGORIZED;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(item);
    }
    const named = [...byCategory.keys()].filter((k) => k !== UNCATEGORIZED).sort((a, b) => a.localeCompare(b));
    const ordered = byCategory.has(UNCATEGORIZED) ? [...named, UNCATEGORIZED] : named;
    return ordered.map((title) => ({ title, data: byCategory.get(title)! }));
  }, [itemsQuery.data]);

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.itemList}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<Text style={styles.empty}>No inventory items yet.</Text>}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 2,
  },
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
