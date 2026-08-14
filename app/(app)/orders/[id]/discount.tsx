import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { applyBillDiscount } from '@/features/orders/orderService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function DiscountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const queryClient = useQueryClient();

  const [type, setType] = useState<'flat' | 'percentage'>('percentage');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [couponCode, setCouponCode] = useState('');

  const applyMutation = useMutation({
    mutationFn: () =>
      applyBillDiscount(id, {
        type,
        value: parseFloat(value) || 0,
        reason: reason || undefined,
        couponCode: couponCode || undefined,
        staffId: currentUser.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      router.back();
    },
  });

  const canApply = parseFloat(value) > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionLabel}>Discount type</Text>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => setType('percentage')}
          style={[styles.chip, type === 'percentage' && styles.chipActive]}
        >
          <Text style={[styles.chipText, type === 'percentage' && styles.chipTextActive]}>Percentage</Text>
        </Pressable>
        <Pressable onPress={() => setType('flat')} style={[styles.chip, type === 'flat' && styles.chipActive]}>
          <Text style={[styles.chipText, type === 'flat' && styles.chipTextActive]}>Flat amount</Text>
        </Pressable>
      </View>

      <FormField
        label={type === 'percentage' ? 'Percentage off' : 'Amount off (₹)'}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        placeholder={type === 'percentage' ? 'e.g. 10' : 'e.g. 100'}
      />
      <FormField
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Regular customer"
      />
      <FormField
        label="Coupon code (optional)"
        value={couponCode}
        onChangeText={setCouponCode}
        placeholder="e.g. WELCOME10"
        autoCapitalize="characters"
      />

      <Button label="Apply discount" onPress={() => applyMutation.mutate()} disabled={!canApply} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
});
