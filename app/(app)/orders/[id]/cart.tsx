import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  clearBillDiscount,
  getOrder,
  parkOrder,
  removeItemFromOrder,
  updateItemQuantity,
} from '@/features/orders/orderService';
import { Button } from '@/components/Button';

export default function CartScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const orderQuery = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });
  const order = orderQuery.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['order', id] });

  const quantityMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      quantity <= 0 ? removeItemFromOrder(itemId) : updateItemQuantity(itemId, quantity),
    onSuccess: invalidate,
  });

  const removeDiscountMutation = useMutation({
    mutationFn: () => clearBillDiscount(id),
    onSuccess: invalidate,
  });

  const parkMutation = useMutation({
    mutationFn: () => parkOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openOrders'] });
      queryClient.invalidateQueries({ queryKey: ['parkedOrders'] });
      router.replace('/orders');
    },
  });

  if (!order) return null;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.billCard}>
          {order.items.length === 0 && <Text style={styles.empty}>No items yet.</Text>}
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.nameSnapshot}</Text>
                {item.modifiers.length > 0 && (
                  <Text style={styles.itemModifiers}>
                    {item.modifiers.map((m) => m.nameSnapshot).join(', ')}
                  </Text>
                )}
                <Text style={styles.itemPrice}>₹{item.unitPriceSnapshot.toFixed(2)} each</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() =>
                    quantityMutation.mutate({ itemId: item.id, quantity: item.quantity - 1 })
                  }
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperButtonText}>−</Text>
                </Pressable>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <Pressable
                  onPress={() =>
                    quantityMutation.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                  }
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.lineTotal}>₹{item.lineSubtotal.toFixed(2)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          {order.billDiscount ? (
            <View style={styles.discountRow}>
              <Text style={styles.discountText}>
                Discount (
                {order.billDiscount.type === 'flat'
                  ? `₹${order.billDiscount.value}`
                  : `${order.billDiscount.value}%`}
                ){order.billDiscount.reason ? ` — ${order.billDiscount.reason}` : ''}
              </Text>
              <Pressable onPress={() => removeDiscountMutation.mutate()}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <Button
              label="+ Apply discount"
              variant="secondary"
              onPress={() => router.push(`/orders/${id}/discount`)}
              style={styles.discountButton}
            />
          )}

          <View style={styles.totalsBlock}>
            <TotalRow label="Subtotal" value={order.subtotal} />
            {order.discountTotal > 0 && <TotalRow label="Discount" value={-order.discountTotal} />}
            <TotalRow label="Tax" value={order.taxTotal} />
            {order.serviceChargeTotal > 0 && (
              <TotalRow label="Service charge" value={order.serviceChargeTotal} />
            )}
            {order.roundingAdjustment !== 0 && (
              <TotalRow label="Rounding" value={order.roundingAdjustment} />
            )}
            <TotalRow label="Total" value={order.grandTotal} emphasize />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Hold / Park"
          variant="secondary"
          onPress={() => parkMutation.mutate()}
          style={{ flex: 1 }}
        />
        <Button
          label="Charge"
          onPress={() => router.push(`/orders/${id}/payment`)}
          disabled={order.items.length === 0}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function TotalRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, emphasize && styles.totalLabelEmphasize]}>{label}</Text>
      <Text style={[styles.totalValue, emphasize && styles.totalLabelEmphasize]}>
        {value < 0 ? '-' : ''}₹{Math.abs(value).toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },
  billCard: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    padding: 16,
  },
  empty: { color: '#999', textAlign: 'center', marginTop: 40 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  itemName: { fontSize: 15, fontWeight: '600' },
  itemModifiers: { fontSize: 12, color: '#888', marginTop: 2 },
  itemPrice: { fontSize: 12, color: '#666', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 16, fontWeight: '700' },
  qtyText: { width: 18, textAlign: 'center', fontWeight: '600' },
  lineTotal: { width: 70, textAlign: 'right', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  discountButton: { marginBottom: 12 },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  discountText: { flex: 1, color: '#2563eb', fontWeight: '600' },
  removeText: { color: '#c0392b', fontWeight: '600' },
  totalsBlock: { marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel: { color: '#666' },
  totalValue: { color: '#333' },
  totalLabelEmphasize: { fontSize: 17, fontWeight: '700', color: '#111' },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});
