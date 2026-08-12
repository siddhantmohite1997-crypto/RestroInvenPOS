import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createTaxRule, deleteTaxRule, listTaxRules } from '@/features/tax/taxService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

interface DraftComponent {
  label: string;
  ratePercent: string;
}

export default function TaxRulesScreen() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const taxRulesQuery = useQuery({
    queryKey: ['taxRules', restaurantId],
    queryFn: () => listTaxRules(restaurantId),
  });

  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [components, setComponents] = useState<DraftComponent[]>([{ label: 'Tax', ratePercent: '0' }]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['taxRules', restaurantId] });

  const createMutation = useMutation({
    mutationFn: () =>
      createTaxRule({
        restaurantId,
        name,
        isDefault,
        components: components.map((c) => ({ label: c.label, ratePercent: parseFloat(c.ratePercent) || 0 })),
      }),
    onSuccess: () => {
      setName('');
      setIsDefault(false);
      setComponents([{ label: 'Tax', ratePercent: '0' }]);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTaxRule(id),
    onSuccess: invalidate,
  });

  function updateComponent(index: number, patch: Partial<DraftComponent>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  const totalRate = components.reduce((sum, c) => sum + (parseFloat(c.ratePercent) || 0), 0);
  const canCreate = name.trim().length > 0 && components.every((c) => c.label.trim().length > 0);

  return (
    <FlatList
      data={taxRulesQuery.data ?? []}
      keyExtractor={(t) => t.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <>
          <Text style={styles.sectionTitle}>Existing tax rules</Text>
        </>
      }
      ListEmptyComponent={<Text style={styles.empty}>No tax rules yet.</Text>}
      renderItem={({ item }) => (
        <View style={styles.ruleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleName}>
              {item.name} {item.isDefault ? '(default)' : ''}
            </Text>
            <Text style={styles.ruleMeta}>
              {item.components.map((c) => `${c.label} ${c.ratePercent}%`).join(' + ')} = {item.totalRatePercent}%
            </Text>
          </View>
          <Pressable onPress={() => deleteMutation.mutate(item.id)}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      )}
      ListFooterComponent={
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>New tax rule</Text>
          <FormField label="Name" value={name} onChangeText={setName} placeholder="e.g. GST 5%" />

          {components.map((c, index) => (
            <View key={index} style={styles.componentRow}>
              <FormField
                label="Component label"
                value={c.label}
                onChangeText={(label) => updateComponent(index, { label })}
                style={{ flex: 1 }}
                placeholder="e.g. CGST"
              />
              <FormField
                label="Rate %"
                value={c.ratePercent}
                onChangeText={(ratePercent) => updateComponent(index, { ratePercent })}
                keyboardType="decimal-pad"
                style={{ width: 90 }}
              />
            </View>
          ))}
          <Button
            label="+ Add component"
            variant="secondary"
            onPress={() => setComponents((prev) => [...prev, { label: '', ratePercent: '0' }])}
            style={{ marginBottom: 16 }}
          />

          <Text style={styles.totalRate}>Total: {totalRate}%</Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Set as default tax rule</Text>
            <Switch value={isDefault} onValueChange={setIsDefault} />
          </View>

          <Button label="Create tax rule" onPress={() => createMutation.mutate()} disabled={!canCreate} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  empty: { color: '#999', marginBottom: 16 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
  },
  ruleName: { fontSize: 15, fontWeight: '600' },
  ruleMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  removeText: { color: '#c0392b', fontWeight: '600' },
  form: { marginTop: 24 },
  componentRow: { flexDirection: 'row', gap: 12 },
  totalRate: { fontSize: 14, color: '#333', marginBottom: 16, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { fontSize: 15, fontWeight: '500' },
});
