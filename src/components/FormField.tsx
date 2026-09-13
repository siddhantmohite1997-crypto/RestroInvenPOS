import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label: string;
}

export function FormField({ label, style, ...inputProps }: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, style]} placeholderTextColor="#999" {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    // Explicit, rather than left to inherit a platform/theme default -- a filled-in value
    // (e.g. a phone number pulled in from a cloud restore) must never be mistakable for the
    // placeholder text sitting in the same spot when empty.
    color: '#111',
  },
});
