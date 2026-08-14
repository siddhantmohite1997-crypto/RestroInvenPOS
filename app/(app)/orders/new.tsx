import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createOrder } from '@/features/orders/orderService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function NewOrderScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const tablesEnabled = useAuthStore((s) => s.restaurant?.tablesEnabled ?? true);
  const queryClient = useQueryClient();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const createMutation = useMutation({
    mutationFn: (orderType: 'dine_in' | 'takeaway' | 'delivery') =>
      createOrder({
        restaurantId,
        orderType,
        staffId: currentUser.id,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
      }),
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: ['openOrders', restaurantId] });
      router.replace(`/orders/${orderId}`);
    },
  });

  function onDineIn() {
    if (tablesEnabled) {
      router.replace('/tables');
      return;
    }
    createMutation.mutate('dine_in');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Order type</Text>

      <Button label="Dine-in" onPress={onDineIn} style={styles.button} />
      {tablesEnabled && <Text style={styles.hint}>Dine-in orders start from the Tables tab.</Text>}

      <View style={styles.divider} />

      <FormField
        label="Customer name (optional)"
        value={customerName}
        onChangeText={setCustomerName}
        placeholder="Walk-in"
      />
      <FormField
        label="Phone (optional)"
        value={customerPhone}
        onChangeText={setCustomerPhone}
        keyboardType="phone-pad"
        placeholder="e.g. 98765 43210"
      />

      <Button
        label="Takeaway"
        variant="secondary"
        onPress={() => createMutation.mutate('takeaway')}
        style={styles.button}
      />
      <Button
        label="Delivery"
        variant="secondary"
        onPress={() => createMutation.mutate('delivery')}
        style={styles.button}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  button: { marginBottom: 8 },
  hint: { color: '#666', fontSize: 13, marginBottom: 16 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 16 },
});
