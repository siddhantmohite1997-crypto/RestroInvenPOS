import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function MoreScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Pressable style={styles.row} onPress={() => router.push('/inventory/purchase')}>
        <Text style={styles.rowText}>Add Purchase Record</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/vendors')}>
        <Text style={styles.rowText}>Vendors</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  row: { padding: 16, borderRadius: 10, backgroundColor: '#f5f5f5' },
  rowText: { fontSize: 16, fontWeight: '600' },
});
