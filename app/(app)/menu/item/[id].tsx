import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { useAuthStore } from '@/store/authStore';
import { needsPriceEditOverride } from '@/features/auth/permissions';
import { logAudit } from '@/features/audit/auditService';
import { listCategories } from '@/features/menu/categoryService';
import { createItem, deleteItem, getItem, setOutOfStock, updateItem } from '@/features/menu/itemService';
import {
  attachModifierGroupToItem,
  detachModifierGroupFromItem,
  getModifierGroupsForItem,
  listModifierGroups,
} from '@/features/menu/modifierService';
import { listTaxRules } from '@/features/tax/taxService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { PinOverrideModal } from '@/components/PinOverrideModal';

export default function ItemEditorScreen() {
  const { id, categoryId: categoryIdParam } = useLocalSearchParams<{ id: string; categoryId?: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const currentUser = useAuthStore((s) => s.currentUser)!;
  const queryClient = useQueryClient();
  const [priceOverrideVisible, setPriceOverrideVisible] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(categoryIdParam ?? null);
  const [taxRuleId, setTaxRuleId] = useState<string | null>(null);
  const [isServiceChargeExempt, setIsServiceChargeExempt] = useState(false);
  const [isOutOfStock, setIsOutOfStock] = useState(false);
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);

  const categoriesQuery = useQuery({
    queryKey: ['categories', restaurantId],
    queryFn: () => listCategories(restaurantId),
  });
  const taxRulesQuery = useQuery({
    queryKey: ['taxRules', restaurantId],
    queryFn: () => listTaxRules(restaurantId),
  });
  const itemQuery = useQuery({
    queryKey: ['item', id],
    queryFn: () => getItem(id),
    enabled: !isNew,
  });
  const allModifierGroupsQuery = useQuery({
    queryKey: ['modifierGroups', restaurantId],
    queryFn: () => listModifierGroups(restaurantId),
    enabled: !isNew,
  });
  const itemModifierGroupsQuery = useQuery({
    queryKey: ['itemModifierGroups', id],
    queryFn: () => getModifierGroupsForItem(id),
    enabled: !isNew,
  });
  const attachedGroupIds = new Set((itemModifierGroupsQuery.data ?? []).map((g) => g.id));

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    const item = itemQuery.data;
    if (!item) return;
    setName(item.name);
    setDescription(item.description ?? '');
    setPrice(String(item.price));
    setCategoryId(item.categoryId);
    setTaxRuleId(item.taxRuleId ?? null);
    setIsServiceChargeExempt(item.isServiceChargeExempt);
    setIsOutOfStock(item.isOutOfStock);
    setImageUri(item.imageUri ?? undefined);
  }, [itemQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['items', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['item', id] });
  };

  const saveMutation = useMutation({
    mutationFn: async (approvedByStaffId?: string) => {
      const input = {
        restaurantId,
        categoryId: categoryId!,
        name,
        description: description || undefined,
        price: parseFloat(price) || 0,
        imageUri,
        taxRuleId: taxRuleId ?? undefined,
        isServiceChargeExempt,
      };
      if (isNew) {
        await createItem(input);
      } else {
        await updateItem(id, input);
      }
      if (approvedByStaffId) {
        await logAudit({
          restaurantId,
          staffId: approvedByStaffId,
          action: 'price_edit_override',
          entityType: 'menu_item',
          entityId: id,
          reason: `Price set to ${input.price.toFixed(2)} (requested by cashier)`,
        });
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const priceChanged = isNew ? parseFloat(price) > 0 : parseFloat(price) !== itemQuery.data?.price;

  function onSavePress() {
    if (priceChanged && needsPriceEditOverride(currentUser.role)) {
      setPriceOverrideVisible(true);
      return;
    }
    saveMutation.mutate(undefined);
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const toggleOutOfStockMutation = useMutation({
    mutationFn: async (value: boolean) => {
      setIsOutOfStock(value);
      if (!isNew) await setOutOfStock(id, value);
    },
    onSuccess: invalidate,
  });

  const toggleModifierGroupMutation = useMutation({
    mutationFn: async ({ groupId, attached }: { groupId: string; attached: boolean }) =>
      attached ? detachModifierGroupFromItem(id, groupId) : attachModifierGroupToItem(id, groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['itemModifierGroups', id] }),
  });

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  const canSave = name.trim().length > 0 && !!categoryId && parseFloat(price) >= 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={pickImage} style={styles.imagePicker}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <Text style={styles.imagePlaceholder}>Tap to add photo</Text>
        )}
      </Pressable>

      <FormField label="Item name" value={name} onChangeText={setName} placeholder="e.g. Paneer Tikka" />
      <FormField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Short description"
        multiline
      />
      <FormField
        label="Price"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      <Text style={styles.sectionLabel}>Category</Text>
      <View style={styles.chipRow}>
        {(categoriesQuery.data ?? []).map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            style={[styles.chip, categoryId === c.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, categoryId === c.id && styles.chipTextActive]}>{c.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Tax rule</Text>
      <View style={styles.chipRow}>
        <Pressable onPress={() => setTaxRuleId(null)} style={[styles.chip, !taxRuleId && styles.chipActive]}>
          <Text style={[styles.chipText, !taxRuleId && styles.chipTextActive]}>None</Text>
        </Pressable>
        {(taxRulesQuery.data ?? []).map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTaxRuleId(t.id)}
            style={[styles.chip, taxRuleId === t.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, taxRuleId === t.id && styles.chipTextActive]}>
              {t.name} ({t.totalRatePercent}%)
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Exempt from service charge</Text>
        <Switch value={isServiceChargeExempt} onValueChange={setIsServiceChargeExempt} />
      </View>

      {!isNew && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Out of stock</Text>
          <Switch value={isOutOfStock} onValueChange={(v) => toggleOutOfStockMutation.mutate(v)} />
        </View>
      )}

      {!isNew && (
        <>
          <Text style={styles.sectionLabel}>Modifier groups</Text>
          <View style={styles.chipRow}>
            {(allModifierGroupsQuery.data ?? []).map((g) => {
              const attached = attachedGroupIds.has(g.id);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => toggleModifierGroupMutation.mutate({ groupId: g.id, attached })}
                  style={[styles.chip, attached && styles.chipActive]}
                >
                  <Text style={[styles.chipText, attached && styles.chipTextActive]}>{g.name}</Text>
                </Pressable>
              );
            })}
            {(allModifierGroupsQuery.data ?? []).length === 0 && (
              <Text style={styles.empty}>No modifier groups yet. Create one from Menu → Modifiers.</Text>
            )}
          </View>
        </>
      )}

      {priceChanged && needsPriceEditOverride(currentUser.role) && (
        <Text style={styles.overrideHint}>Changing the price needs an owner/captain PIN.</Text>
      )}

      <Button
        label={isNew ? 'Create item' : 'Save changes'}
        onPress={onSavePress}
        disabled={!canSave}
        style={styles.saveButton}
      />
      {!isNew && (
        <Button label="Delete item" variant="danger" onPress={() => deleteMutation.mutate()} style={styles.deleteButton} />
      )}

      <PinOverrideModal
        visible={priceOverrideVisible}
        restaurantId={restaurantId}
        title="Manager approval needed"
        message="Only an owner or captain can change prices. Enter their PIN to approve this change."
        onApprove={(approverId) => {
          setPriceOverrideVisible(false);
          saveMutation.mutate(approverId);
        }}
        onCancel={() => setPriceOverrideVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  imagePicker: {
    height: 140,
    borderRadius: 10,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { color: '#888' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { fontSize: 15, fontWeight: '500' },
  saveButton: { marginTop: 8 },
  deleteButton: { marginTop: 12 },
  empty: { color: '#999' },
  overrideHint: { color: '#c0392b', fontSize: 13, marginBottom: 12 },
});
