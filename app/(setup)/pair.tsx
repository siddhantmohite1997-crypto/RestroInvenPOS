import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { pairWithRestaurant } from '@/features/setup/setupService';
import { useAuthStore } from '@/store/authStore';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function PairScreen() {
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const [restaurantId, setRestaurantId] = useState('');
  const [pin, setPin] = useState('');

  const pairMutation = useMutation({
    mutationFn: () => pairWithRestaurant({ restaurantId: restaurantId.trim(), pin: pin.trim() }),
    onSuccess: async () => {
      await hydrate();
      router.replace('/(auth)/login');
    },
    onError: (e) => Alert.alert('Pairing failed', e instanceof Error ? e.message : String(e)),
  });

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
        label={pairMutation.isPending ? 'Pairing…' : 'Pair Device'}
        onPress={() => pairMutation.mutate()}
        disabled={pairMutation.isPending || !restaurantId.trim() || !pin.trim()}
        style={styles.button}
      />
      <Button label="Back" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 4 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 18 },
  button: { marginTop: 8, marginBottom: 10 },
});
