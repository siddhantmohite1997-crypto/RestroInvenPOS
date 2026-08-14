import { useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { getSalesSummary } from '@/features/reports/reportService';
import { today, yesterday, thisWeek, thisMonth } from '@/features/reports/dateRanges';
import { Button } from '@/components/Button';

type PresetKey = 'today' | 'yesterday' | 'week' | 'month';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

const PAYMENT_MODE_LABEL: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', other: 'Other' };

export default function ReportsScreen() {
  const router = useRouter();
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
    queryKey: ['salesSummary', restaurantId, preset],
    queryFn: () => getSalesSummary(restaurantId, range),
  });

  const summary = summaryQuery.data;

  function money(amount: number) {
    return `${currencySymbol}${amount.toFixed(2)}`;
  }

  async function onShare() {
    if (!summary) return;
    const label = PRESETS.find((p) => p.key === preset)?.label ?? '';
    const lines = [
      `Sales report — ${label}`,
      `Orders: ${summary.orderCount}  Voids: ${summary.voidCount}`,
      `Gross sales: ${money(summary.grossSales)}`,
      `Discounts: -${money(summary.discountsGiven)}`,
      `Tax collected: ${money(summary.taxCollected)}`,
      summary.serviceChargeCollected > 0 ? `Service charge: ${money(summary.serviceChargeCollected)}` : null,
      `Net sales: ${money(summary.netSales)}`,
      '',
      'Payment modes:',
      ...Object.entries(summary.paymentModeBreakdown).map(
        ([mode, amount]) => `  ${PAYMENT_MODE_LABEL[mode]}: ${money(amount)}`,
      ),
    ].filter((l): l is string => l !== null);
    await Share.share({ message: lines.join('\n') });
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
            <SummaryCard label="Gross Sales" value={money(summary.grossSales)} />
            <SummaryCard label="Net Sales" value={money(summary.netSales)} emphasize />
          </View>
          <View style={styles.cardRow}>
            <SummaryCard label="Discounts" value={money(summary.discountsGiven)} />
            <SummaryCard label="Tax Collected" value={money(summary.taxCollected)} />
          </View>
          <View style={styles.cardRow}>
            <SummaryCard label="Orders" value={String(summary.orderCount)} />
            <SummaryCard label="Voids" value={String(summary.voidCount)} />
          </View>

          <Text style={styles.sectionLabel}>Payment mode breakdown</Text>
          <View style={styles.paymentBlock}>
            {Object.entries(summary.paymentModeBreakdown).map(([mode, amount]) => (
              <View key={mode} style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>{PAYMENT_MODE_LABEL[mode]}</Text>
                <Text style={styles.paymentValue}>{money(amount)}</Text>
              </View>
            ))}
          </View>

          <Button label="Share report" variant="secondary" onPress={onShare} style={styles.button} />
        </>
      )}

      <Button label="Item-wise Sales" onPress={() => router.push({ pathname: '/reports/item-sales', params: { preset } })} style={styles.button} />
    </ScrollView>
  );
}

function SummaryCard({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={[styles.card, emphasize && styles.cardEmphasize]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, emphasize && styles.cardValueEmphasize]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  card: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14 },
  cardEmphasize: { backgroundColor: '#e8f0fe' },
  cardLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  cardValue: { fontSize: 18, fontWeight: '700' },
  cardValueEmphasize: { color: '#2563eb' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginTop: 12, marginBottom: 8, color: '#333' },
  paymentBlock: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 16 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  paymentLabel: { color: '#666' },
  paymentValue: { fontWeight: '600' },
  button: { marginBottom: 10 },
});
