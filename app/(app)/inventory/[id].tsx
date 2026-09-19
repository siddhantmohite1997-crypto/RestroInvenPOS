import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import {
  createInventoryItem,
  deleteInventoryItem,
  formatQuantity,
  getInventoryItem,
  listInventoryItems,
  updateInventoryItem,
} from '@/features/inventory/inventoryService';
import { FormField } from '@/components/FormField';
import { UnitPicker } from '@/components/UnitPicker';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Button } from '@/components/Button';

export default function InventoryItemEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');

  const itemQuery = useQuery({
    queryKey: ['inventoryItem', id],
    queryFn: () => getInventoryItem(id),
    enabled: !isNew,
  });

  // Same query key the Inventory list screen uses, so this reuses its cache instead of a fresh
  // fetch. Only needed while creating -- once editing an existing item there's nothing to match.
  const existingItemsQuery = useQuery({
    queryKey: ['inventoryItems', restaurantId],
    queryFn: () => listInventoryItems(restaurantId),
    enabled: isNew,
  });

  // A staff member typing "Paneer" while restocking shouldn't end up with two separate "Paneer"
  // rows just because they didn't remember one already exists -- surface the existing item(s) as
  // suggestions so they can jump straight to updating stock on it instead, but leave the choice
  // to them (they can still ignore the suggestion and create a genuinely new item).
  const nameMatches = useMemo(() => {
    const query = name.trim().toLowerCase();
    if (!isNew || !query) return [];
    return (existingItemsQuery.data ?? [])
      .filter((i) => i.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [isNew, name, existingItemsQuery.data]);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    const item = itemQuery.data;
    if (!item) return;
    setName(item.name);
    setCategory(item.category ?? null);
    setUnit(item.unit);
    setQuantity(formatQuantity(item.quantity));
    setLowStockThreshold(item.lowStockThreshold != null ? String(item.lowStockThreshold) : '');
    setCostPerUnit(item.costPerUnit != null ? String(item.costPerUnit) : '');
  }, [itemQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventoryItems', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['inventoryItem', id] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = {
        restaurantId,
        name,
        category: category ?? undefined,
        unit,
        quantity: parseFloat(quantity) || 0,
        lowStockThreshold: lowStockThreshold ? parseFloat(lowStockThreshold) : undefined,
        costPerUnit: costPerUnit ? parseFloat(costPerUnit) : undefined,
      };
      if (isNew) {
        await createInventoryItem(input);
      } else {
        await updateInventoryItem(id, input);
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryItem(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const canSave = name.trim().length > 0 && unit.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag">
      <FormField label="Item name" value={name} onChangeText={setName} placeholder="e.g. Paneer" />
      {nameMatches.length > 0 && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsLabel}>Already in your inventory -- tap to update it instead:</Text>
          {nameMatches.map((match) => (
            <Pressable
              key={match.id}
              style={styles.suggestionRow}
              onPress={() => router.replace(`/inventory/${match.id}`)}
            >
              <Text style={styles.suggestionName}>{match.name}</Text>
              <Text style={styles.suggestionMeta}>
                {formatQuantity(match.quantity)} {match.unit}
                {match.category ? ` · ${match.category}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <CategoryPicker label="Category (optional)" value={category} onChange={setCategory} />
      <UnitPicker label="Unit" value={unit} onChange={setUnit} />
      <FormField label="Quantity in stock" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" />
      <FormField
        label="Low stock threshold (optional)"
        value={lowStockThreshold}
        onChangeText={setLowStockThreshold}
        keyboardType="decimal-pad"
        placeholder="Alert when quantity falls to or below this"
      />
      <FormField
        label="Cost per unit (optional)"
        value={costPerUnit}
        onChangeText={setCostPerUnit}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      <Button
        label={isNew ? 'Create item' : 'Save changes'}
        onPress={() => saveMutation.mutate()}
        disabled={!canSave}
        style={styles.saveButton}
      />
      {!isNew && (
        <Button label="Delete item" variant="danger" onPress={() => deleteMutation.mutate()} style={styles.deleteButton} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  saveButton: { marginTop: 8 },
  deleteButton: { marginTop: 12 },
  suggestions: {
    backgroundColor: '#fff8e6',
    borderRadius: 8,
    padding: 10,
    marginTop: -8,
    marginBottom: 16,
  },
  suggestionsLabel: { fontSize: 12, color: '#8a6d00', marginBottom: 6, fontWeight: '600' },
  suggestionRow: {
    backgroundColor: 'white',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  suggestionName: { fontSize: 15, fontWeight: '600', color: '#111' },
  suggestionMeta: { fontSize: 12, color: '#666', marginTop: 2 },
});
