import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createTable, listTables, type DiningTable } from '@/features/tables/tableService';
import { createOrder } from '@/features/orders/orderService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

const STATUS_STYLE: Record<DiningTable['status'], { bg: string; label: string }> = {
  free: { bg: '#e6f4ea', label: 'Free' },
  occupied: { bg: '#fde8e8', label: 'Occupied' },
  billed: { bg: '#fff6e0', label: 'Billed' },
};

export default function TablesScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const queryClient = useQueryClient();

  const [isAdding, setIsAdding] = useState(false);
  const [newTableName, setNewTableName] = useState('');

  const tablesQuery = useQuery({
    queryKey: ['tables', restaurantId],
    queryFn: () => listTables(restaurantId),
    refetchInterval: 3000,
  });

  const addTableMutation = useMutation({
    mutationFn: () => createTable(restaurantId, newTableName),
    onSuccess: () => {
      setNewTableName('');
      setIsAdding(false);
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
    },
  });

  const openTableMutation = useMutation({
    mutationFn: (table: DiningTable) =>
      createOrder({ restaurantId, orderType: 'dine_in', staffId: currentUser.id, tableId: table.id }),
    onSuccess: (orderId) => {
      queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['openOrders', restaurantId] });
      router.push(`/orders/${orderId}`);
    },
  });

  function onTablePress(table: DiningTable) {
    if (table.status === 'free') {
      openTableMutation.mutate(table);
    } else if (table.currentOrderId) {
      router.push(`/orders/${table.currentOrderId}`);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tablesQuery.data ?? []}
        keyExtractor={(t) => t.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 10 }}
        ListEmptyComponent={<Text style={styles.empty}>No tables yet. Add one below.</Text>}
        renderItem={({ item }) => {
          const status = STATUS_STYLE[item.status];
          return (
            <Pressable
              style={[styles.tableCard, { backgroundColor: status.bg }]}
              onPress={() => onTablePress(item)}
            >
              <Text style={styles.tableName}>{item.name}</Text>
              <Text style={styles.tableStatus}>{status.label}</Text>
            </Pressable>
          );
        }}
      />

      {isAdding ? (
        <View style={styles.addForm}>
          <FormField
            label="Table name"
            value={newTableName}
            onChangeText={setNewTableName}
            placeholder="e.g. T1"
            style={{ marginBottom: 8 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label="Add"
              onPress={() => addTableMutation.mutate()}
              disabled={!newTableName.trim()}
              style={{ flex: 1 }}
            />
            <Button label="Cancel" variant="secondary" onPress={() => setIsAdding(false)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button label="+ Add Table" onPress={() => setIsAdding(true)} style={styles.addButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { padding: 12, gap: 10, paddingBottom: 90 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  tableCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableName: { fontSize: 18, fontWeight: '700' },
  tableStatus: { fontSize: 12, color: '#555', marginTop: 4 },
  addButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  addForm: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: 'white', padding: 12, borderRadius: 10 },
});
