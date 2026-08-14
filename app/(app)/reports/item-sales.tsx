import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { getItemWiseSales } from '@/features/reports/reportService';
import { today, yesterday, thisWeek, thisMonth } from '@/features/reports/dateRanges';

export default function ItemSalesScreen() {
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const restaurantId = useRestaurantId();
  const currencySymbol = useAuthStore((s) => s.restaurant?.currencySymbol ?? '₹');

  const range = useMemo(() => {
    switch (preset) {
      case 'yesterday':
        return yesterday();
      case 'week':
        return thisWeek();
      case 'month':
        return thisMonth();
      default:
        return today();
    }
  }, [preset]);

  const itemSalesQuery = useQuery({
    queryKey: ['itemWiseSales', restaurantId, preset ?? 'today'],
    queryFn: () => getItemWiseSales(restaurantId, range),
  });

  return (
    <FlatList
      data={itemSalesQuery.data ?? []}
      keyExtractor={(item) => item.name}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No sales in this period.</Text>}
      renderItem={({ item, index }) => (
        <View style={styles.row}>
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.qty}>{item.quantitySold} sold</Text>
          </View>
          <Text style={styles.revenue}>
            {currencySymbol}
            {item.revenue.toFixed(2)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12 },
  rank: { width: 28, fontWeight: '700', color: '#999' },
  name: { fontSize: 15, fontWeight: '600' },
  qty: { fontSize: 12, color: '#666', marginTop: 2 },
  revenue: { fontSize: 15, fontWeight: '700' },
});
