import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listModifierGroups } from '@/features/menu/modifierService';
import { Button } from '@/components/Button';

export default function ModifierGroupsScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();

  const groupsQuery = useQuery({
    queryKey: ['modifierGroups', restaurantId],
    queryFn: () => listModifierGroups(restaurantId),
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={groupsQuery.data ?? []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No modifier groups yet — e.g. “Add-ons”, “Spice Level”.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/menu/modifiers/${item.id}`)}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.selectionType === 'single' ? 'Pick one' : 'Pick multiple'}
              {item.isRequired ? ' · Required' : ''} · {item.modifiers.length} option
              {item.modifiers.length === 1 ? '' : 's'}
            </Text>
          </Pressable>
        )}
      />
      <Button label="+ Add Modifier Group" onPress={() => router.push('/menu/modifiers/new')} style={styles.addButton} />
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
