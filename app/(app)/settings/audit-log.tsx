import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listAuditLogs } from '@/features/audit/auditService';
import { listStaff } from '@/features/staff/staffService';

export default function AuditLogScreen() {
  const restaurantId = useRestaurantId();

  const logsQuery = useQuery({
    queryKey: ['auditLogs', restaurantId],
    queryFn: () => listAuditLogs(restaurantId),
  });
  const staffQuery = useQuery({
    queryKey: ['staff', restaurantId],
    queryFn: () => listStaff(restaurantId),
  });

  const staffNameById = new Map((staffQuery.data ?? []).map((s) => [s.id, s.name]));

  return (
    <FlatList
      data={logsQuery.data ?? []}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>No audit entries yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.action}>{item.action.replace(/_/g, ' ')}</Text>
          <Text style={styles.meta}>
            {staffNameById.get(item.staffId) ?? 'Unknown staff'} · {item.entityType} · {new Date(item.createdAt).toLocaleString()}
          </Text>
          {item.reason && <Text style={styles.reason}>{item.reason}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12 },
  action: { fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  meta: { fontSize: 12, color: '#666', marginTop: 4 },
  reason: { fontSize: 13, color: '#333', marginTop: 6 },
});
