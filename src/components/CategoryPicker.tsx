import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';

const COMMON_CATEGORIES = [
  'Meat',
  'Seafood',
  'Dairy',
  'Bakery/Bread',
  'Vegetables',
  'Fruits',
  'Spices & Condiments',
  'Grains & Staples',
  'Beverages',
  'Packaging',
  'Other',
];

interface CategoryPickerProps {
  label: string;
  value: string | null;
  onChange: (category: string | null) => void;
}

/** A dropdown-style picker for inventory categories, so "chicken", "goat meat" and "pork" all
 * end up grouped under the same "Meat" section instead of each staff member typing their own
 * spelling. Custom fallback for house-specific groupings a fixed list won't cover. */
export function CategoryPicker({ label, value, onChange }: CategoryPickerProps) {
  const [visible, setVisible] = useState(false);
  const [customText, setCustomText] = useState('');
  const isCustomValue = !!value && !COMMON_CATEGORIES.includes(value);

  function openModal() {
    setCustomText(isCustomValue ? value! : '');
    setVisible(true);
  }

  function selectCategory(category: string) {
    onChange(category);
    setVisible(false);
  }

  function useCustom() {
    const trimmed = customText.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.field} onPress={openModal}>
        <Text style={value ? styles.value : styles.placeholder}>{value || 'Select a category (optional)'}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.cardTitle}>Select category</Text>
            <View style={styles.chipRow}>
              {COMMON_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => selectCategory(category)}
                  style={[styles.chip, value === category && styles.chipActive]}
                >
                  <Text style={[styles.chipText, value === category && styles.chipTextActive]}>{category}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.customLabel}>Other category</Text>
            <View style={styles.customRow}>
              <TextInput
                style={styles.customInput}
                placeholder="e.g. Frozen goods"
                placeholderTextColor="#999"
                value={customText}
                onChangeText={setCustomText}
                onSubmitEditing={useCustom}
              />
              <Button label="Use" onPress={useCustom} disabled={!customText.trim()} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  value: { fontSize: 16, color: '#000' },
  placeholder: { fontSize: 16, color: '#999' },
  chevron: { color: '#888', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 360 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  customLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6 },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});
