import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createStaff, listStaff, updateStaff } from '@/features/staff/staffService';
import type { StaffRole } from '@/features/auth/permissions';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

const ROLES: { key: StaffRole; label: string }[] = [
  { key: 'cashier', label: 'Cashier' },
  { key: 'admin', label: 'Admin' },
  { key: 'owner', label: 'Owner' },
];

export default function StaffEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [isActive, setIsActive] = useState(true);
  const [pin, setPin] = useState('');

  const staffQuery = useQuery({
    queryKey: ['staff', restaurantId],
    queryFn: () => listStaff(restaurantId),
    enabled: !isNew,
  });
  const existing = staffQuery.data?.find((s) => s.id === id);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setRole(existing.role);
    setIsActive(existing.isActive);
  }, [existing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['staff', restaurantId] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        await createStaff({ restaurantId, name, role, pin });
      } else {
        await updateStaff(id, { name, role, isActive, pin: pin || undefined });
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const canSave = name.trim().length > 0 && (isNew ? /^\d{4,6}$/.test(pin) : true);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FormField label="Name" value={name} onChangeText={setName} placeholder="Staff name" />

      <Text style={styles.sectionLabel}>Role</Text>
      <View style={styles.chipRow}>
        {ROLES.map((r) => (
          <Pressable key={r.key} onPress={() => setRole(r.key)} style={[styles.chip, role === r.key && styles.chipActive]}>
            <Text style={[styles.chipText, role === r.key && styles.chipTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <FormField
        label={isNew ? 'PIN (4-6 digits)' : 'New PIN (leave blank to keep current)'}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
      />

      {!isNew && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch value={isActive} onValueChange={setIsActive} />
        </View>
      )}

      <Button
        label={isNew ? 'Add staff member' : 'Save changes'}
        onPress={() => saveMutation.mutate()}
        disabled={!canSave}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { fontSize: 15, fontWeight: '500' },
});
