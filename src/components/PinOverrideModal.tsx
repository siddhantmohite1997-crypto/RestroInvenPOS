import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { authenticateManagerPin } from '@/features/auth/authService';
import { Button } from './Button';

interface PinOverrideModalProps {
  visible: boolean;
  restaurantId: string;
  title: string;
  message: string;
  requireReason?: boolean;
  onApprove: (approverId: string, reason: string) => void;
  onCancel: () => void;
}

/** A blocking PIN prompt for owner/admin sign-off on a cashier action (price edit, large
 * discount, void). Resolves with the approving staff's ID so callers can attribute the action. */
export function PinOverrideModal({
  visible,
  restaurantId,
  title,
  message,
  requireReason,
  onApprove,
  onCancel,
}: PinOverrideModalProps) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  function reset() {
    setPin('');
    setReason('');
    setError(null);
  }

  async function submit() {
    if (requireReason && !reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setIsChecking(true);
    setError(null);
    const approver = await authenticateManagerPin(restaurantId, pin);
    setIsChecking(false);
    if (!approver) {
      setError('Incorrect PIN.');
      setPin('');
      return;
    }
    const reasonToSend = reason;
    reset();
    onApprove(approver.id, reasonToSend);
  }

  function cancel() {
    reset();
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {requireReason && (
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason (required)"
              placeholderTextColor="#999"
              value={reason}
              onChangeText={setReason}
            />
          )}

          <TextInput
            style={styles.pinInput}
            placeholder="Owner/Admin PIN"
            placeholderTextColor="#999"
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <Button label="Cancel" variant="secondary" onPress={cancel} style={{ flex: 1 }} />
            <Button
              label={isChecking ? 'Checking…' : 'Approve'}
              onPress={submit}
              disabled={isChecking || !pin.trim()}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 360 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  message: { fontSize: 13, color: '#666', marginBottom: 16 },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 20,
    letterSpacing: 4,
    marginBottom: 8,
  },
  error: { color: '#c0392b', marginBottom: 8 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
});
