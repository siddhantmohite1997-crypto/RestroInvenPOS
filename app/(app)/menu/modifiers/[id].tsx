import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import {
  createModifier,
  createModifierGroup,
  deleteModifier,
  deleteModifierGroup,
  listModifierGroups,
  updateModifierGroup,
} from '@/features/menu/modifierService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function ModifierGroupEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [selectionType, setSelectionType] = useState<'single' | 'multiple'>('single');
  const [isRequired, setIsRequired] = useState(false);
  const [newModifierName, setNewModifierName] = useState('');
  const [newModifierPrice, setNewModifierPrice] = useState('0');

  const groupsQuery = useQuery({
    queryKey: ['modifierGroups', restaurantId],
    queryFn: () => listModifierGroups(restaurantId),
  });
  const existing = groupsQuery.data?.find((g) => g.id === id);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setSelectionType(existing.selectionType);
    setIsRequired(existing.isRequired);
  }, [existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['modifierGroups', restaurantId] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const groupId = await createModifierGroup({ restaurantId, name, selectionType, isRequired });
        return groupId;
      }
      await updateModifierGroup(id, { name, selectionType, isRequired });
      return id;
    },
    onSuccess: (groupId) => {
      invalidate();
      if (isNew) router.replace(`/menu/modifiers/${groupId}`);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => deleteModifierGroup(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const addModifierMutation = useMutation({
    mutationFn: () =>
      createModifier({
        modifierGroupId: id,
        name: newModifierName,
        priceDelta: parseFloat(newModifierPrice) || 0,
      }),
    onSuccess: () => {
      setNewModifierName('');
      setNewModifierPrice('0');
      invalidate();
    },
  });

  const deleteModifierMutation = useMutation({
    mutationFn: (modifierId: string) => deleteModifier(modifierId),
    onSuccess: invalidate,
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FormField label="Group name" value={name} onChangeText={setName} placeholder="e.g. Spice Level" />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Allow multiple selections</Text>
        <Switch
          value={selectionType === 'multiple'}
          onValueChange={(v) => setSelectionType(v ? 'multiple' : 'single')}
        />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Required</Text>
        <Switch value={isRequired} onValueChange={setIsRequired} />
      </View>

      <Button label={isNew ? 'Create group' : 'Save group'} onPress={() => saveMutation.mutate()} disabled={!name.trim()} />

      {!isNew && (
        <>
          <Text style={styles.sectionTitle}>Options</Text>
          {(existing?.modifiers ?? []).map((m) => (
            <View key={m.id} style={styles.modifierRow}>
              <Text style={styles.modifierName}>{m.name}</Text>
              <Text style={styles.modifierPrice}>
                {m.priceDelta >= 0 ? '+' : ''}
                {m.priceDelta.toFixed(2)}
              </Text>
              <Pressable onPress={() => deleteModifierMutation.mutate(m.id)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.addModifierRow}>
            <FormField
              label="Option name"
              value={newModifierName}
              onChangeText={setNewModifierName}
              placeholder="e.g. Extra Spicy"
              style={{ flex: 1 }}
            />
            <FormField
              label="Price delta"
              value={newModifierPrice}
              onChangeText={setNewModifierPrice}
              keyboardType="numbers-and-punctuation"
              style={{ width: 100 }}
            />
          </View>
          <Button
            label="+ Add option"
            variant="secondary"
            onPress={() => addModifierMutation.mutate()}
            disabled={!newModifierName.trim()}
          />

          <Button label="Delete group" variant="danger" onPress={() => deleteGroupMutation.mutate()} style={styles.deleteButton} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { fontSize: 15, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modifierName: { flex: 1, fontSize: 15 },
  modifierPrice: { color: '#666' },
  removeText: { color: '#c0392b', fontWeight: '600' },
  addModifierRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  deleteButton: { marginTop: 24 },
});
