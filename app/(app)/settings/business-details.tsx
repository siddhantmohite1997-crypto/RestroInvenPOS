import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View, Pressable } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { updateBusinessDetails, type BusinessDetailsInput } from '@/features/restaurant/restaurantService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

const ROUNDING_OPTIONS: { key: BusinessDetailsInput['roundingRule']; label: string }[] = [
  { key: 'none', label: 'No rounding' },
  { key: 'nearest_1', label: 'Nearest 1' },
  { key: 'nearest_0_5', label: 'Nearest 0.5' },
  { key: 'nearest_5', label: 'Nearest 5' },
];

export default function BusinessDetailsScreen() {
  const restaurant = useAuthStore((s) => s.restaurant);
  const hydrate = useAuthStore((s) => s.hydrate);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<BusinessDetailsInput>({
    name: '',
    legalName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'IN',
    phone: '',
    email: '',
    taxIdLabel: 'GSTIN',
    taxId: '',
    currencyCode: 'INR',
    currencySymbol: '₹',
    invoicePrefix: 'INV',
    invoiceFooterText: '',
    serviceChargeEnabled: false,
    serviceChargePercent: 0,
    roundingRule: 'nearest_1',
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the form once the restaurant loads */
  useEffect(() => {
    if (!restaurant) return;
    setForm({
      name: restaurant.name,
      legalName: restaurant.legalName ?? '',
      addressLine1: restaurant.addressLine1 ?? '',
      addressLine2: restaurant.addressLine2 ?? '',
      city: restaurant.city ?? '',
      state: restaurant.state ?? '',
      postalCode: restaurant.postalCode ?? '',
      country: restaurant.country,
      phone: restaurant.phone ?? '',
      email: restaurant.email ?? '',
      taxIdLabel: restaurant.taxIdLabel,
      taxId: restaurant.taxId ?? '',
      currencyCode: restaurant.currencyCode,
      currencySymbol: restaurant.currencySymbol,
      invoicePrefix: restaurant.invoicePrefix,
      invoiceFooterText: restaurant.invoiceFooterText ?? '',
      serviceChargeEnabled: restaurant.serviceChargeEnabled,
      serviceChargePercent: restaurant.serviceChargePercent,
      roundingRule: restaurant.roundingRule,
    });
  }, [restaurant]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => updateBusinessDetails(restaurant!.id, form),
    onSuccess: () => {
      hydrate();
      queryClient.invalidateQueries();
      Alert.alert('Saved', 'Business details updated.');
    },
    onError: (err) => {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not save business details.');
    },
  });

  function set<K extends keyof BusinessDetailsInput>(key: K, value: BusinessDetailsInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FormField label="Restaurant name" value={form.name} onChangeText={(v) => set('name', v)} />
      <FormField label="Legal name (optional)" value={form.legalName} onChangeText={(v) => set('legalName', v)} />
      <FormField label="Address line 1" value={form.addressLine1} onChangeText={(v) => set('addressLine1', v)} />
      <FormField label="Address line 2" value={form.addressLine2} onChangeText={(v) => set('addressLine2', v)} />
      <FormField label="City" value={form.city} onChangeText={(v) => set('city', v)} />
      <FormField label="State" value={form.state} onChangeText={(v) => set('state', v)} />
      <FormField label="Postal code" value={form.postalCode} onChangeText={(v) => set('postalCode', v)} />
      <FormField label="Country code (e.g. IN, US, GB)" value={form.country} onChangeText={(v) => set('country', v)} autoCapitalize="characters" />
      <FormField label="Phone" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
      <FormField label="Email" value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" />

      <View style={styles.row}>
        <FormField
          label="Tax ID label (e.g. GSTIN, VAT No.)"
          value={form.taxIdLabel}
          onChangeText={(v) => set('taxIdLabel', v)}
          style={{ flex: 1 }}
        />
      </View>
      <FormField label="Tax ID number" value={form.taxId} onChangeText={(v) => set('taxId', v)} />

      <View style={styles.row}>
        <FormField
          label="Currency code"
          value={form.currencyCode}
          onChangeText={(v) => set('currencyCode', v)}
          autoCapitalize="characters"
          style={{ flex: 1 }}
        />
        <FormField
          label="Currency symbol"
          value={form.currencySymbol}
          onChangeText={(v) => set('currencySymbol', v)}
          style={{ width: 100 }}
        />
      </View>

      <FormField label="Invoice number prefix" value={form.invoicePrefix} onChangeText={(v) => set('invoicePrefix', v)} />
      <FormField
        label="Invoice footer text (optional)"
        value={form.invoiceFooterText}
        onChangeText={(v) => set('invoiceFooterText', v)}
        multiline
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Service charge</Text>
        <Switch value={form.serviceChargeEnabled} onValueChange={(v) => set('serviceChargeEnabled', v)} />
      </View>
      {form.serviceChargeEnabled && (
        <FormField
          label="Service charge %"
          value={String(form.serviceChargePercent)}
          onChangeText={(v) => set('serviceChargePercent', parseFloat(v) || 0)}
          keyboardType="decimal-pad"
        />
      )}

      <Text style={styles.sectionLabel}>Bill rounding</Text>
      <View style={styles.chipRow}>
        {ROUNDING_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => set('roundingRule', opt.key)}
            style={[styles.chip, form.roundingRule === opt.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, form.roundingRule === opt.key && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <Button label="Save business details" onPress={() => saveMutation.mutate()} disabled={!form.name.trim()} style={styles.saveButton} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', gap: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { fontSize: 15, fontWeight: '500' },
  saveButton: { marginTop: 8 },
});
