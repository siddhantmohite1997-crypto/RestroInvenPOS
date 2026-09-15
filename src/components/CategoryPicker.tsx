import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native';

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

/** Inline chip row for inventory categories, matching the Menu screens' category-chip pattern
 * (tap to select, no modal in the way) -- so "chicken", "goat meat" and "pork" all end up
 * grouped under the same "Meat" section instead of each staff member typing their own spelling.
 * The free-text field below covers a house-specific grouping the fixed list doesn't have. */
export function CategoryPicker({ label, value, onChange }: CategoryPickerProps) {
  const isCustomValue = !!value && !COMMON_CATEGORIES.includes(value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipRow}>
        {COMMON_CATEGORIES.map((category) => (
          <Pressable
            key={category}
            onPress={() => onChange(value === category ? null : category)}
            style={[styles.chip, value === category && styles.chipActive]}
          >
            <Text style={[styles.chipText, value === category && styles.chipTextActive]}>{category}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.customLabel}>Or type your own</Text>
      <TextInput
        style={styles.customInput}
        placeholder="e.g. Frozen goods"
        placeholderTextColor="#999"
        value={isCustomValue ? value! : ''}
        onChangeText={(text) => onChange(text.trim() ? text : null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  customLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  customInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111',
  },
});
