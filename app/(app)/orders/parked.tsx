import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listParkedOrders, resumeOrder } from '@/features/orders/orderService';

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export default function ParkedOrdersScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const parkedOrdersQuery = useQuery({
    queryKey: ['parkedOrders', restaurantId],
    queryFn: () => listParkedOrders(restaurantId),
  });

  const resumeMutation = useMutation({
    mutationFn: (orderId: string) => resumeOrder(orderId),
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['parkedOrders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['openOrders', restaurantId] });
      router.replace(`/orders/${orderId}`);
    },
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={parkedOrdersQuery.data ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No parked bills.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => resumeMutation.mutate(item.id)}>
            <Text style={styles.orderType}>{ORDER_TYPE_LABEL[item.orderType]}</Text>
            <Text style={styles.orderMeta}>
              {item.customerName ? `${item.customerName} · ` : ''}₹{item.grandTotal.toFixed(2)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, gap: 8 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#f5f5f5' },
  orderType: { fontSize: 16, fontWeight: '600' },
  orderMeta: { fontSize: 13, color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
});
