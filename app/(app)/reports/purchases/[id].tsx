import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseDetail } from '@/features/inventory/purchaseService';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQuery = useQuery({
    queryKey: ['purchaseDetail', id],
    queryFn: () => getPurchaseDetail(id),
  });
  const detail = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (detailQuery.isSuccess && !detail) {
    return (
      <View style={styles.center}>
        <Text>Purchase not found</Text>
      </View>
    );
  }

  if (!detail) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.supplier}>{detail.supplierName ?? 'No supplier'}</Text>
      <Text style={styles.date}>{detail.purchasedAt.toLocaleString()}</Text>

      <View style={styles.card}>
        {detail.lines.map((line) => (
          <View key={line.id} style={styles.lineRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{line.itemName}</Text>
              <Text style={styles.lineMeta}>
                {line.quantity} {line.unit} × ₹{line.costPerUnit.toFixed(2)}
              </Text>
            </View>
            <Text style={styles.lineTotal}>₹{line.totalCost.toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₹{detail.totalCost.toFixed(2)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  supplier: { fontSize: 20, fontWeight: '700' },
  date: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 16 },
  card: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 16 },
  lineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  lineName: { fontSize: 15, fontWeight: '600' },
  lineMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  lineTotal: { fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 10, marginTop: 4 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 16, fontWeight: '700' },
});
