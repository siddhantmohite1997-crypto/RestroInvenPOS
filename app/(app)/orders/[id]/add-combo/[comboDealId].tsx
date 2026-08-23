import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getComboWithItems } from '@/features/menu/comboService';
import { addItemToOrder } from '@/features/orders/orderService';
import { Button } from '@/components/Button';

export default function AddComboScreen() {
  const { id, comboDealId } = useLocalSearchParams<{ id: string; comboDealId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [quantity, setQuantity] = useState(1);

  const comboQuery = useQuery({
    queryKey: ['combo', comboDealId],
    queryFn: () => getComboWithItems(comboDealId),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      addItemToOrder(id, {
        comboDealId,
        quantity,
        modifiers: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      router.back();
    },
  });

  const combo = comboQuery.data;
  if (!combo) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{combo.name}</Text>
        <Text style={styles.price}>₹{combo.price.toFixed(2)}</Text>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Items in this combo:</Text>
        {combo.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemText}>
              {item.quantity}× {item.menuItemName}
            </Text>
          </View>
        ))}

        <View style={styles.divider} />

        <Text style={styles.label}>Quantity</Text>
        <View style={styles.quantityRow}>
          <Button
            label="−"
            onPress={() => setQuantity(Math.max(1, quantity - 1))}
            variant="secondary"
            style={{ width: 50 }}
          />
          <Text style={styles.quantityText}>{quantity}</Text>
          <Button
            label="+"
            onPress={() => setQuantity(quantity + 1)}
            variant="secondary"
            style={{ width: 50 }}
          />
        </View>
      </View>

      <Button
        label={addMutation.isPending ? 'Adding…' : 'Add to Order'}
        onPress={() => addMutation.mutate()}
        style={styles.addButton}
      />
      <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={styles.cancelButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  price: { fontSize: 16, fontWeight: '600', color: '#2563eb', marginBottom: 12 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  itemRow: { paddingVertical: 6, paddingLeft: 8, borderLeftWidth: 3, borderLeftColor: '#2563eb' },
  itemText: { fontSize: 13, color: '#333' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityText: { fontSize: 16, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  addButton: { marginBottom: 8 },
  cancelButton: {},
});
