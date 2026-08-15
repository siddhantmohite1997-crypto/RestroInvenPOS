import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { clearFirebaseConfig, getFirebaseConfig, getLastSyncedAt, setFirebaseConfig } from '@/features/sync/syncConfig';
import { getPendingChangeCount, syncNow } from '@/features/sync/syncService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function SyncScreen() {
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [appId, setAppId] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setIsOnline(state.isConnected ?? true));
    return unsubscribe;
  }, []);

  const configQuery = useQuery({
    queryKey: ['firebaseConfig', restaurantId],
    queryFn: () => getFirebaseConfig(restaurantId),
  });
  const lastSyncedQuery = useQuery({
    queryKey: ['lastSyncedAt', restaurantId],
    queryFn: () => getLastSyncedAt(restaurantId),
  });
  const pendingCountQuery = useQuery({
    queryKey: ['pendingSyncCount', restaurantId],
    queryFn: () => getPendingChangeCount(restaurantId),
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the form once the saved config loads */
  useEffect(() => {
    const config = configQuery.data;
    if (!config) return;
    setApiKey(config.apiKey);
    setProjectId(config.projectId);
    setAppId(config.appId);
  }, [configQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveConfigMutation = useMutation({
    mutationFn: () => setFirebaseConfig(restaurantId, { apiKey, projectId, appId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['firebaseConfig', restaurantId] }),
  });

  const clearConfigMutation = useMutation({
    mutationFn: () => clearFirebaseConfig(restaurantId),
    onSuccess: () => {
      setApiKey('');
      setProjectId('');
      setAppId('');
      queryClient.invalidateQueries({ queryKey: ['firebaseConfig', restaurantId] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncNow(restaurantId),
    onSuccess: (result) => {
      setErrorMessage(null);
      const total = Object.values(result.pushedCounts).reduce((sum, n) => sum + n, 0);
      setResultMessage(`Synced ${total} changed record${total === 1 ? '' : 's'}.`);
      queryClient.invalidateQueries({ queryKey: ['lastSyncedAt', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['pendingSyncCount', restaurantId] });
    },
    onError: (e) => {
      setResultMessage(null);
      setErrorMessage(e instanceof Error ? e.message : String(e));
    },
  });

  const isConfigured = !!configQuery.data;
  const canSaveConfig = apiKey.trim().length > 0 && projectId.trim().length > 0 && appId.trim().length > 0;
  const pendingCount = pendingCountQuery.data ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.statusCard}>
        <Text style={styles.statusRow}>
          Connectivity: <Text style={isOnline ? styles.ok : styles.warn}>{isOnline ? 'Online' : 'Offline'}</Text>
        </Text>
        <Text style={styles.statusRow}>
          Last synced: {lastSyncedQuery.data ? lastSyncedQuery.data.toLocaleString() : 'Never'}
        </Text>
        <Text style={styles.statusRow}>Pending changes: {pendingCount}</Text>
      </View>

      {!isConfigured && (
        <Text style={styles.hint}>
          Enter your Firebase project’s web app config to enable backup sync. This pushes local
          data to Firestore one-way, on demand — it doesn’t pull changes from other devices yet.
        </Text>
      )}

      <FormField label="API Key" value={apiKey} onChangeText={setApiKey} placeholder="AIza..." />
      <FormField label="Project ID" value={projectId} onChangeText={setProjectId} placeholder="my-restaurant-12345" />
      <FormField label="App ID" value={appId} onChangeText={setAppId} placeholder="1:123:web:abc" />

      <Button label="Save Firebase config" onPress={() => saveConfigMutation.mutate()} disabled={!canSaveConfig} style={styles.button} />
      {isConfigured && (
        <Button label="Remove config" variant="danger" onPress={() => clearConfigMutation.mutate()} style={styles.button} />
      )}

      {resultMessage && <Text style={styles.success}>{resultMessage}</Text>}
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Button
        label={syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
        onPress={() => syncMutation.mutate()}
        disabled={!isConfigured || !isOnline || syncMutation.isPending}
        style={styles.syncButton}
      />
      {!isOnline && <Text style={styles.hint}>You’re offline — sync will resume once you’re back online.</Text>}

      <Text style={styles.hint} />
      <Text style={styles.hint}>
        Everything in this app works fully offline — sync is only for backing data up to Firebase
        when you have a connection. Nothing here blocks billing, printing, or receipts.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  statusCard: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 14, marginBottom: 16 },
  statusRow: { fontSize: 14, marginBottom: 4 },
  ok: { color: '#2e7d32', fontWeight: '700' },
  warn: { color: '#c0392b', fontWeight: '700' },
  hint: { color: '#666', fontSize: 13, marginBottom: 16 },
  button: { marginBottom: 10 },
  syncButton: { marginTop: 8 },
  success: { color: '#2e7d32', marginBottom: 12 },
  error: { color: '#c0392b', marginBottom: 12 },
});
