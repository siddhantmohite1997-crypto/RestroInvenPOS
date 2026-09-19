import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { monthLabel } from '@/features/reports/dateRanges';

const MONTHS_BACK_OPTIONS = 24;

interface MonthPickerProps {
  /** null means no month is picked -- the caller's own fixed presets (Today/Yesterday/...)
   * are in effect instead. */
  monthsBack: number | null;
  onChange: (monthsBack: number) => void;
}

/** A "Pick a month" chip that opens a scrollable list of the last 24 months by name (e.g. "Aug
 * 2026") -- lets a report screen look back further than its fixed Today/Yesterday/This Week/
 * This Month presets, without a full calendar date-range picker this app has no dependency for.
 * Same dropdown-in-a-Modal shape as UnitPicker.tsx. */
export function MonthPicker({ monthsBack, onChange }: MonthPickerProps) {
  const [visible, setVisible] = useState(false);
  const label = monthsBack != null ? monthLabel(monthsBack) : 'Pick a month';

  function select(n: number) {
    onChange(n);
    setVisible(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.chip, monthsBack != null && styles.chipActive]}
      >
        <Text style={[styles.chipText, monthsBack != null && styles.chipTextActive]}>{label}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.cardTitle}>Pick a month</Text>
            <ScrollView style={styles.list}>
              {Array.from({ length: MONTHS_BACK_OPTIONS }, (_, n) => (
                <Pressable
                  key={n}
                  style={[styles.row, monthsBack === n && styles.rowActive]}
                  onPress={() => select(n)}
                >
                  <Text style={[styles.rowText, monthsBack === n && styles.rowTextActive]}>
                    {monthLabel(n)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 360, maxHeight: '70%' },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  list: { maxHeight: 360 },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  rowActive: { backgroundColor: '#e8f0fe' },
  rowText: { fontSize: 15, fontWeight: '600', color: '#333' },
  rowTextActive: { color: '#2563eb' },
});
