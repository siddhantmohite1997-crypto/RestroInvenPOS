import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { getOrder, recordPayment } from '@/features/orders/orderService';
import { Button } from '@/components/Button';

const MODES: { key: 'cash' | 'card' | 'upi' | 'other'; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'card', label: 'Card' },
  { key: 'upi', label: 'UPI' },
  { key: 'other', label: 'Other' },
];

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'cash' | 'card' | 'upi' | 'other'>('cash');
  const [reference, setReference] = useState('');

  const orderQuery = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });

  const payMutation = useMutation({
    mutationFn: () => recordPayment(id, { mode, reference: reference || undefined, staffId: currentUser.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openOrders'] });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      router.replace(`/orders/${id}/receipt`);
    },
  });

  const total = orderQuery.data?.grandTotal ?? 0;

  return (
    <View style={styles.container}>
      <Text style={styles.totalLabel}>Amount due</Text>
      <Text style={styles.totalValue}>₹{total.toFixed(2)}</Text>

      <Text style={styles.sectionLabel}>Payment mode</Text>
      <View style={styles.chipRow}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key)}
            style={[styles.chip, mode === m.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, mode === m.key && styles.chipTextActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      {mode !== 'cash' && (
        <TextInput
          style={styles.input}
          placeholder="Reference / transaction ID (optional)"
          placeholderTextColor="#999"
          value={reference}
          onChangeText={setReference}
        />
      )}

      <Button
        label={`Confirm ${MODES.find((m) => m.key === mode)?.label} payment`}
        onPress={() => payMutation.mutate()}
        disabled={payMutation.isPending || total <= 0}
        style={styles.confirmButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  totalLabel: { color: '#666', fontSize: 14, marginBottom: 4 },
  totalValue: { fontSize: 36, fontWeight: '700', marginBottom: 24 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  confirmButton: { marginTop: 8 },
});
