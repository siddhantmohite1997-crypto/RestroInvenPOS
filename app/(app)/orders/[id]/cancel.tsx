import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { cancelOrder } from '@/features/orders/orderService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

/** Cancels a not-yet-paid order (still 'active' or 'parked') -- e.g. a table opened by mistake,
 * or a customer who left before ordering. Before this screen existed, there was no way to
 * release a table in that state: "Charge" is disabled with zero items, parking never frees the
 * table, and Void only applies to a paid order's receipt. */
export default function CancelOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const restaurantId = useRestaurantId();

  const [reason, setReason] = useState('');

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id, { staffId: currentUser.id, reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['openOrders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['parkedOrders', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
      router.dismissTo('/orders');
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag">
      <Text style={styles.warning}>
        This releases the table (if any) and removes this order -- it never counted as a sale, so
        there's nothing to refund. This can't be undone.
      </Text>

      <FormField
        label="Reason"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Wrong table, customer left"
      />

      <Button
        label="Cancel Order"
        variant="danger"
        onPress={() => cancelMutation.mutate()}
        disabled={!reason.trim() || cancelMutation.isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  warning: { color: '#666', fontSize: 13, marginBottom: 16, lineHeight: 18 },
});
