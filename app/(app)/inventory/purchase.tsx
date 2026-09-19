import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listInventoryItems } from '@/features/inventory/inventoryService';
import { getSupplierSuggestions, recordSupplierPurchase, type PurchaseLineInput } from '@/features/inventory/purchaseService';
import { round2 } from '@/features/tax/taxEngine';
import { FormField } from '@/components/FormField';
import { UnitPicker } from '@/components/UnitPicker';
import { CategoryPicker } from '@/components/CategoryPicker';
import { Button } from '@/components/Button';

interface AddedLine extends PurchaseLineInput {
  key: string;
  displayName: string;
}

export default function PurchaseEntryScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const queryClient = useQueryClient();

  // Supplier
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierGst, setSupplierGst] = useState('');

  // Current line being entered
  const [itemQuery, setItemQuery] = useState('');
  const [matchedItemId, setMatchedItemId] = useState<string | null>(null);
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<string | null>(null);
  const [lineQuantity, setLineQuantity] = useState('');
  const [lineCost, setLineCost] = useState('');

  const [lines, setLines] = useState<AddedLine[]>([]);

  const suppliersQuery = useQuery({
    queryKey: ['supplierSuggestions', restaurantId, supplierQuery],
    queryFn: () => getSupplierSuggestions(restaurantId, supplierQuery),
    enabled: supplierQuery.trim().length > 0 && !supplierId,
  });

  const itemsQuery = useQuery({
    queryKey: ['inventoryItems', restaurantId],
    queryFn: () => listInventoryItems(restaurantId),
  });

  const itemMatches = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q || matchedItemId) return [];
    return (itemsQuery.data ?? []).filter((i) => i.name.toLowerCase().includes(q)).slice(0, 5);
  }, [itemQuery, matchedItemId, itemsQuery.data]);

  const isNewItem = itemQuery.trim().length > 0 && !matchedItemId;
  const canAddLine =
    itemQuery.trim().length > 0 &&
    (matchedItemId != null || newItemUnit.trim().length > 0) &&
    (parseFloat(lineQuantity) || 0) > 0 &&
    (parseFloat(lineCost) || 0) > 0;

  function onPickItem(item: { id: string; name: string }) {
    setMatchedItemId(item.id);
    setItemQuery(item.name);
  }

  function onAddLine() {
    if (!canAddLine) return;
    const quantity = parseFloat(lineQuantity) || 0;
    const costPerUnit = parseFloat(lineCost) || 0;
    setLines((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        displayName: itemQuery.trim(),
        inventoryItemId: matchedItemId ?? undefined,
        newItemName: matchedItemId ? undefined : itemQuery.trim(),
        newItemUnit: matchedItemId ? undefined : newItemUnit.trim(),
        newItemCategory: matchedItemId ? undefined : (newItemCategory ?? undefined),
        quantity,
        costPerUnit,
      },
    ]);
    setItemQuery('');
    setMatchedItemId(null);
    setNewItemUnit('');
    setNewItemCategory(null);
    setLineQuantity('');
    setLineCost('');
  }

  function onRemoveLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const runningTotal = round2(lines.reduce((sum, l) => sum + round2(l.quantity * l.costPerUnit), 0));

  const saveMutation = useMutation({
    mutationFn: () =>
      recordSupplierPurchase({
        restaurantId,
        staffId: currentUser.id,
        supplierId: supplierId ?? undefined,
        newSupplierName: supplierId ? undefined : supplierQuery.trim() || undefined,
        newSupplierPhone: supplierId ? undefined : supplierPhone.trim() || undefined,
        newSupplierGstNumber: supplierId ? undefined : supplierGst.trim() || undefined,
        lines: lines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          newItemName: l.newItemName,
          newItemUnit: l.newItemUnit,
          newItemCategory: l.newItemCategory,
          quantity: l.quantity,
          costPerUnit: l.costPerUnit,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventoryItems', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['dailyExpense', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['purchases', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['purchasesTotal', restaurantId] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not save this purchase.');
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag">
      <Text style={styles.sectionLabel}>Supplier (optional)</Text>
      <FormField
        label="Supplier name"
        value={supplierQuery}
        onChangeText={(text) => {
          setSupplierQuery(text);
          setSupplierId(null);
        }}
        placeholder="e.g. Fresh Farms Traders"
      />
      {suppliersQuery.data && suppliersQuery.data.length > 0 && (
        <View style={styles.suggestions}>
          {suppliersQuery.data.map((s) => (
            <Pressable
              key={s.id}
              style={styles.suggestionRow}
              onPress={() => {
                setSupplierId(s.id);
                setSupplierQuery(s.name);
              }}
            >
              <Text style={styles.suggestionName}>{s.name}</Text>
              {s.phone ? <Text style={styles.suggestionMeta}>{s.phone}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
      {supplierQuery.trim().length > 0 && !supplierId && (
        <View style={styles.newSupplierFields}>
          <FormField label="Phone (optional)" value={supplierPhone} onChangeText={setSupplierPhone} keyboardType="phone-pad" />
          <FormField label="GST number (optional)" value={supplierGst} onChangeText={setSupplierGst} autoCapitalize="characters" />
        </View>
      )}

      <View style={styles.divider} />

      <Text style={styles.sectionLabel}>Add item</Text>
      <FormField
        label="Item name"
        value={itemQuery}
        onChangeText={(text) => {
          setItemQuery(text);
          setMatchedItemId(null);
        }}
        placeholder="e.g. Paneer"
      />
      {itemMatches.length > 0 && (
        <View style={styles.suggestions}>
          {itemMatches.map((item) => (
            <Pressable key={item.id} style={styles.suggestionRow} onPress={() => onPickItem(item)}>
              <Text style={styles.suggestionName}>{item.name}</Text>
              <Text style={styles.suggestionMeta}>{item.unit}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {isNewItem && (
        <View style={styles.newSupplierFields}>
          <CategoryPicker label="Category (optional)" value={newItemCategory} onChange={setNewItemCategory} />
          <UnitPicker label="Unit" value={newItemUnit} onChange={setNewItemUnit} />
        </View>
      )}
      <FormField label="Quantity" value={lineQuantity} onChangeText={setLineQuantity} keyboardType="decimal-pad" placeholder="0" />
      <FormField label="Cost per unit" value={lineCost} onChangeText={setLineCost} keyboardType="decimal-pad" placeholder="0.00" />
      <Button label="+ Add Line" variant="secondary" onPress={onAddLine} disabled={!canAddLine} style={styles.addLineButton} />

      {lines.length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Lines ({lines.length})</Text>
          {lines.map((l) => (
            <View key={l.key} style={styles.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{l.displayName}</Text>
                <Text style={styles.lineMeta}>
                  {l.quantity} × ₹{l.costPerUnit.toFixed(2)}
                </Text>
              </View>
              <Text style={styles.lineTotal}>₹{round2(l.quantity * l.costPerUnit).toFixed(2)}</Text>
              <Pressable onPress={() => onRemoveLine(l.key)} style={styles.removeButton}>
                <Text style={styles.removeButtonText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Text style={styles.runningTotal}>Total: ₹{runningTotal.toFixed(2)}</Text>
        </>
      )}

      <Button
        label={saveMutation.isPending ? 'Saving…' : 'Save Purchase'}
        onPress={() => saveMutation.mutate()}
        disabled={lines.length === 0 || saveMutation.isPending}
        style={styles.saveButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 16 },
  suggestions: { backgroundColor: '#fff8e6', borderRadius: 8, padding: 10, marginTop: -8, marginBottom: 16 },
  suggestionRow: { backgroundColor: 'white', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 },
  suggestionName: { fontSize: 15, fontWeight: '600', color: '#111' },
  suggestionMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  newSupplierFields: { marginBottom: 4 },
  addLineButton: { marginTop: 4, marginBottom: 8 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  lineName: { fontSize: 15, fontWeight: '600' },
  lineMeta: { fontSize: 12, color: '#666', marginTop: 2 },
  lineTotal: { fontWeight: '700', width: 80, textAlign: 'right' },
  removeButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fde8e8', alignItems: 'center', justifyContent: 'center' },
  removeButtonText: { color: '#c0392b', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  runningTotal: { fontSize: 16, fontWeight: '700', color: '#2563eb', marginTop: 8, marginBottom: 16, textAlign: 'right' },
  saveButton: { marginTop: 8 },
});
