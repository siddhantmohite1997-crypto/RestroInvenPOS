import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
const MAX_PIN_LENGTH = 6;

export default function LoginScreen() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const restaurant = useAuthStore((s) => s.restaurant);
  const login = useAuthStore((s) => s.login);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (currentUser) {
    return <Redirect href="/(app)/orders" />;
  }

  async function submitPin(nextPin: string) {
    setIsVerifying(true);
    setError(null);
    const ok = await login(nextPin);
    setIsVerifying(false);
    if (!ok) {
      setError('Incorrect PIN');
      setPin('');
    }
  }

  function onKeyPress(key: string) {
    if (isVerifying || !key) return;
    if (key === 'del') {
      setPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    const nextPin = (pin + key).slice(0, MAX_PIN_LENGTH);
    setPin(nextPin);
    setError(null);
    if (nextPin.length >= 4) {
      submitPin(nextPin);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{restaurant?.name ?? 'POS'}</Text>
      <Text style={styles.subtitle}>Enter your PIN</Text>

      <View style={styles.dots}>
        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.keypad}>
        {KEYS.map((key, i) => (
          <Pressable
            key={i}
            disabled={!key}
            onPress={() => onKeyPress(key)}
            style={[styles.key, !key && styles.keyHidden]}
          >
            <Text style={styles.keyText}>{key === 'del' ? '⌫' : key}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 12 },
  dots: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#999' },
  dotFilled: { backgroundColor: '#333' },
  errorText: { color: 'red', marginBottom: 8 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, justifyContent: 'center' },
  key: {
    width: 84,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 26, fontWeight: '600' },
});
