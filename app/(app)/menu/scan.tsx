import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { extractMenuItemsFromImage } from '@/features/menu/ocrService';
import { useMenuScanStore } from '@/store/menuScanStore';
import { Button } from '@/components/Button';

export default function MenuScanScreen() {
  const router = useRouter();
  const setDrafts = useMenuScanStore((s) => s.setDrafts);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function processImage(uri: string) {
    setImageUri(uri);
    setError(null);
    setIsExtracting(true);
    try {
      const items = await extractMenuItemsFromImage(uri);
      setDrafts(items);
      router.push('/menu/scan-review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to extract menu items.');
    } finally {
      setIsExtracting(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to scan a menu.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan a menu</Text>
      <Text style={styles.subtitle}>
        Photograph a physical menu card. Extracted items will show on a review screen — nothing
        is saved until you confirm.
      </Text>

      {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
      {isExtracting && <ActivityIndicator size="large" style={{ marginVertical: 16 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <Button label="Take Photo" onPress={takePhoto} disabled={isExtracting} style={styles.button} />
      <Button
        label="Choose from Library"
        variant="secondary"
        onPress={pickFromLibrary}
        disabled={isExtracting}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#666', marginBottom: 20 },
  preview: { width: '100%', height: 220, borderRadius: 10, marginBottom: 16 },
  error: { color: '#c0392b', marginBottom: 12 },
  button: { marginBottom: 12 },
});
