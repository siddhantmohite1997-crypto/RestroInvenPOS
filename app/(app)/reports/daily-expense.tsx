import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { getDailyExpenseSummary } from '@/features/inventory/inventoryService';
import { today, yesterday, thisWeek, thisMonth } from '@/features/reports/dateRanges';

type PresetKey = 'today' | 'yesterday' | 'week' | 'month';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

/** How much was actually spent restocking inventory in a date range -- separate from Sales
 * Reports (money coming in), this is money going out, so a restaurant can see whether it's
 * actually turning a profit rather than just looking at gross sales in isolation. */
export default function DailyExpenseScreen() {
  const restaurantId = useRestaurantId();
  const currencySymbol = useAuthStore((s) => s.restaurant?.currencySymbol ?? '₹');
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

  const summaryQuery = useQuery({
    queryKey: ['dailyExpense', restaurantId, preset],
    queryFn: () => getDailyExpenseSummary(restaurantId, range),
  });

  const summary = summaryQuery.data;

  function money(amount: number) {
    return `${currencySymbol}${amount.toFixed(2)}`;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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

      {summary && (
        <>
          <View style={styles.cardRow}>
            <View style={[styles.card, styles.cardEmphasize]}>
              <Text style={styles.cardLabel}>Total Spent</Text>
              <Text style={[styles.cardValue, styles.cardValueEmphasize]}>{money(summary.totalSpent)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Restocks</Text>
              <Text style={styles.cardValue}>{summary.purchaseCount}</Text>
            </View>
          </View>

          {summary.byDay.length === 0 ? (
            <Text style={styles.empty}>No restocks recorded in this range.</Text>
          ) : (
            <>
              <Text style={styles.sectionLabel}>By day</Text>
              <View style={styles.block}>
                {summary.byDay.map((d) => (
                  <View key={d.date} style={styles.row}>
                    <Text style={styles.rowLabel}>{d.date}</Text>
                    <Text style={styles.rowValue}>{money(d.total)}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionLabel}>By item</Text>
              <View style={styles.block}>
                {summary.byItem.map((i) => (
                  <View key={i.inventoryItemId} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{i.name}</Text>
                      <Text style={styles.rowMeta}>
                        {i.quantity} {i.unit}
                      </Text>
                    </View>
                    <Text style={styles.rowValue}>{money(i.total)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  card: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14 },
  cardEmphasize: { backgroundColor: '#fde8e8' },
  cardLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  cardValue: { fontSize: 18, fontWeight: '700' },
  cardValueEmphasize: { color: '#c0392b' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 8, color: '#333' },
  block: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowLabel: { color: '#333', fontWeight: '600' },
  rowMeta: { color: '#888', fontSize: 12, marginTop: 1 },
  rowValue: { fontWeight: '700', color: '#c0392b' },
  empty: { textAlign: 'center', color: '#999', marginTop: 20 },
});
