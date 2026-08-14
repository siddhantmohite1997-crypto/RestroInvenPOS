import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getItem } from '@/features/menu/itemService';
import { getModifierGroupsForItem } from '@/features/menu/modifierService';
import { addItemToOrder } from '@/features/orders/orderService';
import { Button } from '@/components/Button';

export default function AddItemModifierScreen() {
  const { id, menuItemId } = useLocalSearchParams<{ id: string; menuItemId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  const itemQuery = useQuery({ queryKey: ['item', menuItemId], queryFn: () => getItem(menuItemId) });
  const groupsQuery = useQuery({
    queryKey: ['itemModifierGroups', menuItemId],
    queryFn: () => getModifierGroupsForItem(menuItemId),
  });

  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  function toggleModifier(groupId: string, modifierId: string, selectionType: 'single' | 'multiple') {
    setSelections((prev) => {
      const current = prev[groupId] ?? [];
      if (selectionType === 'single') {
        return { ...prev, [groupId]: [modifierId] };
      }
      const next = current.includes(modifierId)
        ? current.filter((m) => m !== modifierId)
        : [...current, modifierId];
      return { ...prev, [groupId]: next };
    });
  }

  const missingRequired = groups.some((g) => g.isRequired && (selections[g.id] ?? []).length === 0);

  const selectedModifiers = useMemo(
    () =>
      groups.flatMap((g) =>
        (selections[g.id] ?? [])
          .map((modId) => g.modifiers.find((m) => m.id === modId))
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map((m) => ({ modifierId: m.id, name: m.name, priceDelta: m.priceDelta })),
      ),
    [groups, selections],
  );

  const addMutation = useMutation({
    mutationFn: () =>
      addItemToOrder(id, {
        menuItemId,
        quantity,
        modifiers: selectedModifiers,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      router.back();
    },
  });

  const unitPrice = (itemQuery.data?.price ?? 0) + selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{itemQuery.data?.name}</Text>

      {groups.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text style={styles.groupTitle}>
            {group.name} {group.isRequired ? '(required)' : '(optional)'}
          </Text>
          {group.modifiers.map((m) => {
            const selected = (selections[group.id] ?? []).includes(m.id);
            return (
              <Pressable
                key={m.id}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => toggleModifier(group.id, m.id, group.selectionType)}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{m.name}</Text>
                <Text style={[styles.optionPrice, selected && styles.optionTextSelected]}>
                  {m.priceDelta >= 0 ? '+' : ''}
                  {m.priceDelta.toFixed(2)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.stepperRow}>
        <Text style={styles.groupTitle}>Quantity</Text>
        <View style={styles.stepper}>
          <Pressable onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={styles.stepperButton}>
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.qtyText}>{quantity}</Text>
          <Pressable onPress={() => setQuantity((q) => q + 1)} style={styles.stepperButton}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Button
        label={`Add to order · ₹${(unitPrice * quantity).toFixed(2)}`}
        onPress={() => addMutation.mutate()}
        disabled={missingRequired}
        style={styles.addButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  group: { marginBottom: 20 },
  groupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 6,
  },
  optionSelected: { backgroundColor: '#2563eb' },
  optionText: { fontSize: 15 },
  optionPrice: { fontSize: 14, color: '#666' },
  optionTextSelected: { color: 'white' },
  stepperRow: { marginBottom: 24 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 20, fontWeight: '700' },
  qtyText: { fontSize: 18, fontWeight: '600', width: 24, textAlign: 'center' },
  addButton: { marginTop: 8 },
});
