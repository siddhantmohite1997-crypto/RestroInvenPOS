import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listVendors } from '@/features/inventory/purchaseService';
import { Button } from '@/components/Button';

export default function VendorsScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const vendorsQuery = useQuery({
    queryKey: ['vendors', restaurantId],
    queryFn: () => listVendors(restaurantId),
  });

  // This screen stays mounted in the background when reached via a tab (Captain's More tab, or
  // Owner's Settings > More link), so without this, a supplier created inline from the Purchase
  // entry screen never shows up here until the app restarts. Re-fetch every time the screen
  // actually comes into view instead.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['vendors', restaurantId] });
    }, [queryClient, restaurantId]),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={vendorsQuery.data ?? []}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No vendors yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/vendors/${item.id}`)}>
            <Text style={styles.rowName}>{item.name}</Text>
            {item.phone ? <Text style={styles.rowMeta}>{item.phone}</Text> : null}
          </Pressable>
        )}
      />
      <Button label="+ Add Vendor" onPress={() => router.push('/vendors/new')} style={styles.addButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 90, gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#f5f5f5' },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  addButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
