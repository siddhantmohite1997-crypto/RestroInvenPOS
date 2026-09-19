import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listPurchases } from '@/features/inventory/purchaseService';
import { today, yesterday, thisWeek, thisMonth } from '@/features/reports/dateRanges';

type PresetKey = 'today' | 'yesterday' | 'week' | 'month';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

export default function PurchaseReportScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const [preset, setPreset] = useState<PresetKey>('today');

  const range = useMemo(() => {
    switch (preset) {
      case 'today':
        return today();
      case 'yesterday':
        return yesterday();
      case 'week':
        return thisWeek();
      case 'month':
        return thisMonth();
    }
  }, [preset]);

  const purchasesQuery = useQuery({
    queryKey: ['purchases', restaurantId, preset],
    queryFn: () => listPurchases(restaurantId, range),
  });

  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPreset(p.key)}
            style={[styles.chip, preset === p.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, preset === p.key && styles.chipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={purchasesQuery.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No purchases in this range.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/reports/purchases/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowSupplier}>{item.supplierName ?? 'No supplier'}</Text>
              <Text style={styles.rowMeta}>
                {item.purchasedAt.toLocaleDateString()} · {item.itemCount} item{item.itemCount === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={styles.rowTotal}>₹{item.totalCost.toFixed(2)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, paddingBottom: 0 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  list: { padding: 16, gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, backgroundColor: '#f5f5f5' },
  rowSupplier: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  rowTotal: { fontWeight: '700', fontSize: 16 },
});
