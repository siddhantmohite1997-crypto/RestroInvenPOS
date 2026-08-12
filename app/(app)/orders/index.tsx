import { StyleSheet, Text, View } from 'react-native';

export default function OrdersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Billing</Text>
      <Text style={styles.subtitle}>Order entry & billing screen — coming in Phase 3.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#666', textAlign: 'center' },
});
