import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import {
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  updateInventoryItem,
} from '@/features/inventory/inventoryService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function InventoryItemEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');

  const itemQuery = useQuery({
    queryKey: ['inventoryItem', id],
    queryFn: () => getInventoryItem(id),
    enabled: !isNew,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    const item = itemQuery.data;
    if (!item) return;
    setName(item.name);
    setUnit(item.unit);
    setQuantity(String(item.quantity));
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
    <ScrollView contentContainerStyle={styles.container}>
      <FormField label="Item name" value={name} onChangeText={setName} placeholder="e.g. Paneer" />
      <FormField label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g. kg, l, pcs" />
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
});
