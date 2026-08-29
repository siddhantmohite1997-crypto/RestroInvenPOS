import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { getItem } from '@/features/menu/itemService';
import { getRecipeIngredients, listInventoryItems, setRecipeIngredients } from '@/features/inventory/inventoryService';
import { Button } from '@/components/Button';

export default function RecipeIngredientsScreen() {
  const { menuItemId } = useLocalSearchParams<{ menuItemId: string }>();
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  // Keyed by inventoryItemId; presence in this map means the ingredient is selected. The
  // string value is the quantity-required field's raw text so the user can freely edit it
  // (including clearing it) without fighting a parsed-number round-trip.
  const [selected, setSelected] = useState<Record<string, string>>({});

  const itemQuery = useQuery({ queryKey: ['item', menuItemId], queryFn: () => getItem(menuItemId) });
  const inventoryQuery = useQuery({
    queryKey: ['inventoryItems', restaurantId],
    queryFn: () => listInventoryItems(restaurantId),
  });
  const existingQuery = useQuery({
    queryKey: ['recipeIngredients', menuItemId],
    queryFn: () => getRecipeIngredients(menuItemId),
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate selection once existing links load */
  useEffect(() => {
    if (!existingQuery.data) return;
    const initial: Record<string, string> = {};
    for (const row of existingQuery.data) {
      initial[row.inventoryItemId] = String(row.quantityRequired);
    }
    setSelected(initial);
  }, [existingQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggle(inventoryItemId: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (inventoryItemId in next) {
        delete next[inventoryItemId];
      } else {
        next[inventoryItemId] = '';
      }
      return next;
    });
  }

  function setQuantity(inventoryItemId: string, value: string) {
    setSelected((prev) => ({ ...prev, [inventoryItemId]: value }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(selected)
        .map(([inventoryItemId, qty]) => ({ inventoryItemId, quantityRequired: parseFloat(qty) || 0 }))
        .filter((r) => r.quantityRequired > 0);
      await setRecipeIngredients(menuItemId, rows);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipeIngredients', menuItemId] });
      queryClient.invalidateQueries({ queryKey: ['recipeIngredientCounts', restaurantId] });
      router.back();
    },
  });

  const inventoryItems = inventoryQuery.data ?? [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.itemName}>{itemQuery.data?.name}</Text>
      <Text style={styles.hint}>Select which inventory items this dish uses, and how much of each per serving.</Text>

      {inventoryItems.length === 0 && (
        <Text style={styles.empty}>No inventory items yet. Add some from the Inventory tab first.</Text>
      )}

      {inventoryItems.map((inv) => {
        const isSelected = inv.id in selected;
        return (
          <View key={inv.id} style={styles.row}>
            <Pressable style={styles.rowHeader} onPress={() => toggle(inv.id)}>
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]} />
              <Text style={styles.rowName}>{inv.name}</Text>
              <Text style={styles.rowStock}>
                {inv.quantity} {inv.unit} in stock
              </Text>
            </Pressable>
            {isSelected && (
              <View style={styles.quantityRow}>
                <Text style={styles.quantityLabel}>Required per serving (in {inv.unit})</Text>
                <TextInput
                  style={styles.quantityInput}
                  value={selected[inv.id]}
                  onChangeText={(v) => setQuantity(inv.id, v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
              </View>
            )}
          </View>
        );
      })}

      <Button label="Save ingredients" onPress={() => saveMutation.mutate()} style={styles.saveButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  itemName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 13, color: '#666', marginBottom: 16 },
  empty: { color: '#999', marginBottom: 16 },
  row: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 8 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#999' },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  rowName: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowStock: { fontSize: 12, color: '#666' },
  quantityRow: { marginTop: 10, paddingLeft: 30 },
  quantityLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  quantityInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    backgroundColor: 'white',
  },
  saveButton: { marginTop: 8 },
});
