import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useAuthStore } from '@/store/authStore';

export default function SettingsScreen() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurant = useAuthStore((s) => s.restaurant);
  const logout = useAuthStore((s) => s.logout);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.row}>Restaurant: {restaurant?.name}</Text>
      <Text style={styles.row}>Signed in as: {currentUser?.name}</Text>
      <Text style={styles.row}>Role: {currentUser?.role}</Text>
      <Text style={styles.subtitle}>
        Business details, tax rules & staff management — coming in Phase 2/6.
      </Text>
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
  subtitle: { color: '#666', textAlign: 'center', marginTop: 12, marginBottom: 12 },
  logoutButton: {
    backgroundColor: '#c0392b',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  logoutText: { color: 'white', fontWeight: '700', fontSize: 16 },
});
