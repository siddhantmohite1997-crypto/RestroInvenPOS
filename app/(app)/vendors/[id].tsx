import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createVendor, deleteVendor, getVendor, updateVendor } from '@/features/inventory/purchaseService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function VendorEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  const vendorQuery = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendor(id),
    enabled: !isNew,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    const vendor = vendorQuery.data;
    if (!vendor) return;
    setName(vendor.name);
    setPhone(vendor.phone ?? '');
    setGstNumber(vendor.gstNumber ?? '');
  }, [vendorQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vendors', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['vendor', id] });
    queryClient.invalidateQueries({ queryKey: ['supplierSuggestions', restaurantId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = { name, phone: phone.trim() || undefined, gstNumber: gstNumber.trim() || undefined };
      if (isNew) {
        await createVendor({ restaurantId, ...input });
      } else {
        await updateVendor(id, input);
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteVendor(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const canSave = name.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag">
      <FormField label="Vendor name" value={name} onChangeText={setName} placeholder="e.g. Fresh Farms Traders" />
      <FormField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <FormField label="GST number (optional)" value={gstNumber} onChangeText={setGstNumber} autoCapitalize="characters" />

      <Button
        label={isNew ? 'Add vendor' : 'Save changes'}
        onPress={() => saveMutation.mutate()}
        disabled={!canSave}
        style={styles.saveButton}
      />
      {!isNew && (
        <Button label="Delete vendor" variant="danger" onPress={() => deleteMutation.mutate()} style={styles.deleteButton} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  saveButton: { marginTop: 8 },
  deleteButton: { marginTop: 12 },
});
