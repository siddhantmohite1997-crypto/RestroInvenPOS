import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createLocalRestaurant } from '@/db/seed';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/Button';

export default function WelcomeScreen() {
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const [isCreating, setIsCreating] = useState(false);

  async function onStartFresh() {
    setIsCreating(true);
    await createLocalRestaurant();
    await hydrate();
    router.replace('/(auth)/login');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to POS</Text>
      <Text style={styles.subtitle}>Set up this device to get started</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Start a new restaurant</Text>
        <Text style={styles.cardBody}>
          Sets this device up as its own restaurant, ready to use immediately. Good for a
          single location managed entirely on this phone.
        </Text>
        <Button label={isCreating ? 'Setting up…' : 'Start Fresh'} onPress={onStartFresh} disabled={isCreating} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pair with an existing restaurant</Text>
        <Text style={styles.cardBody}>
          If your restaurant was already registered (e.g. by an admin), enter its ID and your
          staff PIN to attach this device to it.
        </Text>
        <Button
          label="Pair Device"
          variant="secondary"
          onPress={() => router.push('/(setup)/pair')}
          disabled={isCreating}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 12 },
  card: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 18, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, color: '#555', lineHeight: 19 },
});
