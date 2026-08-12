import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listItems } from '@/features/menu/itemService';
import { createCombo, deleteCombo, getComboWithItems, updateCombo } from '@/features/menu/comboService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function ComboEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const itemsQuery = useQuery({
    queryKey: ['allItems', restaurantId],
    queryFn: () => listItems(restaurantId),
  });
  const comboQuery = useQuery({
    queryKey: ['combo', id],
    queryFn: () => getComboWithItems(id),
    enabled: !isNew,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    const combo = comboQuery.data;
    if (!combo) return;
    setName(combo.name);
    setPrice(String(combo.price));
    setQuantities(Object.fromEntries(combo.items.map((i) => [i.menuItemId, i.quantity])));
  }, [comboQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['combos', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['combo', id] });
  };

  const items = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = { restaurantId, name, price: parseFloat(price) || 0, items };
      if (isNew) {
        await createCombo(input);
      } else {
        await updateCombo(id, input);
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCombo(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  function adjustQuantity(itemId: string, delta: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta) }));
  }

  const canSave = name.trim().length > 0 && parseFloat(price) >= 0 && items.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FormField label="Combo name" value={name} onChangeText={setName} placeholder="e.g. Lunch Combo" />
      <FormField label="Combo price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="0.00" />

      <Text style={styles.sectionLabel}>Items included</Text>
      {(itemsQuery.data ?? []).map((item) => {
        const qty = quantities[item.id] ?? 0;
        return (
          <View key={item.id} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <View style={styles.stepper}>
              <Pressable onPress={() => adjustQuantity(item.id, -1)} style={styles.stepperButton}>
                <Text style={styles.stepperButtonText}>−</Text>
              </Pressable>
              <Text style={styles.qtyText}>{qty}</Text>
              <Pressable onPress={() => adjustQuantity(item.id, 1)} style={styles.stepperButton}>
                <Text style={styles.stepperButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Button
        label={isNew ? 'Create combo' : 'Save combo'}
        onPress={() => saveMutation.mutate()}
        disabled={!canSave}
        style={styles.saveButton}
      />
      {!isNew && (
        <Button label="Delete combo" variant="danger" onPress={() => deleteMutation.mutate()} style={styles.deleteButton} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333', marginTop: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemName: { fontSize: 15, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 18, fontWeight: '700' },
  qtyText: { width: 20, textAlign: 'center', fontWeight: '600' },
  saveButton: { marginTop: 20 },
  deleteButton: { marginTop: 12 },
});
