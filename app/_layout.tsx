import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations';
import { useAuthStore } from '@/store/authStore';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { success: migrationsReady, error: migrationError } = useMigrations(db, migrations);
  const [bootstrapped, setBootstrapped] = useState(false);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!migrationsReady) return;
    // Whether this device has a restaurant yet (locally created or paired) is decided
    // by (setup)/welcome.tsx, not here — hydrate() just reflects whatever's already
    // in the local DB (possibly nothing yet), and (auth)/_layout.tsx routes accordingly.
    hydrate().then(() => setBootstrapped(true));
  }, [migrationsReady, hydrate]);

  if (migrationError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Database migration failed: {migrationError.message}</Text>
      </View>
    );
  }

  if (!migrationsReady || !bootstrapped) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: 'red', textAlign: 'center' },
});
