import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createTable, listTables, setTableStatus, type DiningTable } from '@/features/tables/tableService';
import { createOrder, getOrder } from '@/features/orders/orderService';
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

  // A manual escape hatch for a table that's stuck non-free with no way to reach its order from
  // the UI -- e.g. its order was removed outside the app (a direct DB delete, a bad sync), or an
  // order/table desync from an interrupted write. Resets the table locally; if the pointed-to
  // order still genuinely exists and is still open, staff can always re-occupy the table fresh
  // and the old order remains reachable via Cancel/Void from wherever it's still linked.
  const releaseTableMutation = useMutation({
    mutationFn: (tableId: string) => setTableStatus(tableId, 'free', null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables', restaurantId] }),
  });

  function confirmRelease(table: DiningTable, message: string) {
    Alert.alert(`Release ${table.name}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Release', style: 'destructive', onPress: () => releaseTableMutation.mutate(table.id) },
    ]);
  }

  async function onTablePress(table: DiningTable) {
    if (table.status === 'free') {
      openTableMutation.mutate(table);
      return;
    }
    if (!table.currentOrderId) {
      confirmRelease(
        table,
        'This table is marked Occupied but has no order attached to it anymore. Release it back to Free?',
      );
      return;
    }
    const order = await getOrder(table.currentOrderId);
    if (!order || order.status === 'paid' || order.status === 'void') {
      confirmRelease(
        table,
        "This table's order no longer exists or is already closed out, but the table itself never got freed. Release it back to Free?",
      );
      return;
    }
    router.push(`/orders/${table.currentOrderId}`);
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
              onLongPress={() =>
                item.status !== 'free' &&
                confirmRelease(item, `Force ${item.name} back to Free, regardless of any order on it?`)
              }
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
