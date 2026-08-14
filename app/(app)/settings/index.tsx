import { StyleSheet, Text, View, Pressable, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { setTablesEnabled } from '@/features/restaurant/restaurantService';

export default function SettingsScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurant = useAuthStore((s) => s.restaurant);
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);

  const toggleTablesMutation = useMutation({
    mutationFn: (enabled: boolean) => setTablesEnabled(restaurant!.id, enabled),
    onSuccess: hydrate,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.row}>Restaurant: {restaurant?.name}</Text>
      <Text style={styles.row}>Signed in as: {currentUser?.name}</Text>
      <Text style={styles.row}>Role: {currentUser?.role}</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Table management</Text>
        <Switch
          value={restaurant?.tablesEnabled ?? true}
          onValueChange={(v) => toggleTablesMutation.mutate(v)}
        />
      </View>

      <Pressable style={styles.linkRow} onPress={() => router.push('/settings/tax-rules')}>
        <Text style={styles.linkText}>Tax Rules</Text>
      </Pressable>

      <Text style={styles.subtitle}>Business details & staff management — coming in Phase 6.</Text>
      <Pressable style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  row: { fontSize: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 260,
    marginTop: 12,
  },
  switchLabel: { fontSize: 15, fontWeight: '500' },
  linkRow: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  linkText: { fontSize: 15, fontWeight: '600', color: '#2563eb' },
  subtitle: { color: '#666', textAlign: 'center', marginTop: 12, marginBottom: 12 },
  logoutButton: {
    backgroundColor: '#c0392b',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
