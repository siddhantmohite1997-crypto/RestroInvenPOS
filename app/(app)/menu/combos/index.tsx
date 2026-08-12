import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listCombos } from '@/features/menu/comboService';
import { Button } from '@/components/Button';

export default function CombosScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();

  const combosQuery = useQuery({
    queryKey: ['combos', restaurantId],
    queryFn: () => listCombos(restaurantId),
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={combosQuery.data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No combo deals yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/menu/combos/${item.id}`)}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              ₹{item.price.toFixed(2)} · {item.items.map((i) => `${i.quantity}× ${i.menuItemName}`).join(', ')}
            </Text>
          </Pressable>
        )}
      />
      <Button label="+ Add Combo" onPress={() => router.push('/menu/combos/new')} style={styles.addButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12, paddingBottom: 90, gap: 8 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#f5f5f5' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  addButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
