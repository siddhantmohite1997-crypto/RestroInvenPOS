import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { pairWithRestaurant, restoreFromCloud } from '@/features/setup/setupService';
import { useAuthStore } from '@/store/authStore';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function PairScreen() {
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const [restaurantId, setRestaurantId] = useState('');
  const [pin, setPin] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const pairMutation = useMutation({
    mutationFn: async () => {
      const trimmedId = restaurantId.trim();
      const trimmedPin = pin.trim();
      const { staffId } = await pairWithRestaurant({ restaurantId: trimmedId, pin: trimmedPin });
      setIsRestoring(true);
      try {
        // Failing to restore shouldn't strand the user on this screen -- they're already
        // validly paired at this point (the local restaurant + their own login both exist).
        // Surface it, but let them into the app; they can retry from a future re-pair if this
        // was a transient network blip.
        await restoreFromCloud(trimmedId, trimmedPin, staffId);
      } catch (restoreError) {
        Alert.alert(
          "Couldn't restore existing data",
          restoreError instanceof Error
            ? restoreError.message
            : "Pairing succeeded, but this restaurant's existing menu/inventory/staff data couldn't be pulled down. You can keep using the app — try re-pairing later to fetch it.",
        );
      } finally {
        setIsRestoring(false);
      }
    },
    onSuccess: async () => {
      await hydrate();
      router.replace('/(auth)/login');
    },
    onError: (e) => Alert.alert('Pairing failed', e instanceof Error ? e.message : String(e)),
  });

  const isBusy = pairMutation.isPending || isRestoring;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pair with your restaurant</Text>
      <Text style={styles.subtitle}>
        Ask whoever registered your restaurant for its ID, or find it in the admin panel.
      </Text>

      <FormField
        label="Restaurant ID"
        value={restaurantId}
        onChangeText={setRestaurantId}
        placeholder="e.g. spice-route-diner-4kd9"
        autoCapitalize="none"
      />
      <FormField
        label="Your PIN"
        value={pin}
        onChangeText={setPin}
        placeholder="4-6 digits"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
      />

      <Button
        label={isRestoring ? 'Restoring your data…' : pairMutation.isPending ? 'Pairing…' : 'Pair Device'}
        onPress={() => pairMutation.mutate()}
        disabled={isBusy || !restaurantId.trim() || !pin.trim()}
        style={styles.button}
      />
      <Button label="Back" variant="secondary" onPress={() => router.back()} disabled={isBusy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 4 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 18 },
  button: { marginTop: 8, marginBottom: 10 },
});
