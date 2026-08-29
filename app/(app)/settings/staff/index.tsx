import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listStaff } from '@/features/staff/staffService';
import { Button } from '@/components/Button';

// Stored values are unchanged (owner/admin/cashier) — see the comment on StaffRole in permissions.ts.
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Captain', cashier: 'Waiter' };

export default function StaffListScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();

  const staffQuery = useQuery({
    queryKey: ['staff', restaurantId],
    queryFn: () => listStaff(restaurantId),
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={staffQuery.data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/settings/staff/${item.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {ROLE_LABEL[item.role]} {!item.isActive ? '· Inactive' : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
      <Button label="+ Add Staff" onPress={() => router.push('/settings/staff/new')} style={styles.addButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, paddingBottom: 90, gap: 8 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#f5f5f5' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  addButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
