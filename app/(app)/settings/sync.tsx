import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '@/store/authStore';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import {
  getAutoSyncTime,
  getLastSyncedAt,
  getSyncMode,
  setAutoSyncTime,
  setSyncMode,
  type SyncMode,
} from '@/features/sync/syncConfig';
import { getPendingChangeCount, syncNow } from '@/features/sync/syncService';
import { listRecentSyncLogs } from '@/features/sync/syncLogService';
import { Button } from '@/components/Button';

const PAD = (n: number) => String(n).padStart(2, '0');
const TIME_OPTIONS = Array.from({ length: 24 }, (_, h) => `${PAD(h)}:00`);

export default function SyncScreen() {
  const restaurantId = useRestaurantId();
  const currentPin = useAuthStore((s) => s.currentPin);
  const queryClient = useQueryClient();

  const [isOnline, setIsOnline] = useState(true);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => setIsOnline(state.isConnected ?? true));
    return unsubscribe;
  }, []);

  const lastSyncedQuery = useQuery({
    queryKey: ['lastSyncedAt', restaurantId],
    queryFn: () => getLastSyncedAt(restaurantId),
  });
  const pendingCountQuery = useQuery({
    queryKey: ['pendingSyncCount', restaurantId],
    queryFn: () => getPendingChangeCount(restaurantId),
  });
  const syncModeQuery = useQuery({
    queryKey: ['syncMode', restaurantId],
    queryFn: () => getSyncMode(restaurantId),
  });
  const autoSyncTimeQuery = useQuery({
    queryKey: ['autoSyncTime', restaurantId],
    queryFn: () => getAutoSyncTime(restaurantId),
  });
  const syncLogsQuery = useQuery({
    queryKey: ['syncLogs', restaurantId],
    queryFn: () => listRecentSyncLogs(restaurantId),
  });

  const syncMutation = useMutation({
    mutationFn: () => {
      if (!currentPin) throw new Error('Please log out and back in, then try again.');
      return syncNow(restaurantId, currentPin, 'manual');
    },
    onSuccess: (result) => {
      setErrorMessage(null);
      const total = Object.values(result.pushedCounts).reduce((sum, n) => sum + n, 0);
      setResultMessage(`Synced ${total} changed record${total === 1 ? '' : 's'}.`);
      queryClient.invalidateQueries({ queryKey: ['lastSyncedAt', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['pendingSyncCount', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['syncLogs', restaurantId] });
    },
    onError: (e) => {
      setResultMessage(null);
      setErrorMessage(e instanceof Error ? e.message : String(e));
      queryClient.invalidateQueries({ queryKey: ['syncLogs', restaurantId] });
    },
  });

  const modeMutation = useMutation({
    mutationFn: (mode: SyncMode) => setSyncMode(restaurantId, mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['syncMode', restaurantId] }),
  });

  const timeMutation = useMutation({
    mutationFn: (time: string) => setAutoSyncTime(restaurantId, time),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['autoSyncTime', restaurantId] }),
  });

  const pendingCount = pendingCountQuery.data ?? 0;
  const syncMode = syncModeQuery.data ?? 'manual';
  const autoSyncTime = autoSyncTimeQuery.data ?? '09:00';

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

      {resultMessage && <Text style={styles.success}>{resultMessage}</Text>}
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Button
        label={syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
        onPress={() => syncMutation.mutate()}
        disabled={!isOnline || syncMutation.isPending}
        style={styles.syncButton}
      />
      {!isOnline && <Text style={styles.hint}>You’re offline — sync will resume once you’re back online.</Text>}

      <Text style={styles.sectionLabel}>Sync mode</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, syncMode === 'manual' && styles.modeChipActive]}
          onPress={() => modeMutation.mutate('manual')}
        >
          <Text style={[styles.modeChipText, syncMode === 'manual' && styles.modeChipTextActive]}>Manual</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, syncMode === 'auto' && styles.modeChipActive]}
          onPress={() => modeMutation.mutate('auto')}
        >
          <Text style={[styles.modeChipText, syncMode === 'auto' && styles.modeChipTextActive]}>Auto</Text>
        </Pressable>
      </View>

      {syncMode === 'manual' ? (
        <Text style={styles.hint}>
          You’ll get a reminder if it’s been more than 2 days since your last sync.
        </Text>
      ) : (
        <>
          <Text style={styles.hint}>
            Syncs automatically once a day, the first time you open the app after this time.
          </Text>
          <View style={styles.timeGrid}>
            {TIME_OPTIONS.map((t) => (
              <Pressable
                key={t}
                style={[styles.timeChip, autoSyncTime === t && styles.timeChipActive]}
                onPress={() => timeMutation.mutate(t)}
              >
                <Text style={[styles.timeChipText, autoSyncTime === t && styles.timeChipTextActive]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {syncLogsQuery.data && syncLogsQuery.data.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Recent sync activity</Text>
          <View style={styles.logList}>
            {syncLogsQuery.data.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logMessage}>
                    {log.triggeredBy === 'auto' ? 'Auto' : 'Manual'} sync —{' '}
                    <Text style={log.status === 'success' ? styles.ok : styles.warn}>{log.status}</Text>
                  </Text>
                  {log.message && <Text style={styles.logDetail}>{log.message}</Text>}
                </View>
                <Text style={styles.logTime}>{new Date(log.startedAt).toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.hint} />
      <Text style={styles.hint}>
        Everything in this app works fully offline — cloud sync just backs your data up on demand
        or on schedule. Nothing here blocks billing, printing, or receipts.
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
  syncButton: { marginTop: 8 },
  success: { color: '#2e7d32', marginBottom: 12 },
  error: { color: '#c0392b', marginBottom: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginTop: 8, marginBottom: 8, color: '#333' },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#eee', alignItems: 'center' },
  modeChipActive: { backgroundColor: '#2563eb' },
  modeChipText: { color: '#333', fontWeight: '600' },
  modeChipTextActive: { color: 'white' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eee' },
  timeChipActive: { backgroundColor: '#2563eb' },
  timeChipText: { color: '#333', fontSize: 13, fontWeight: '600' },
  timeChipTextActive: { color: 'white' },
  logList: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginBottom: 16, gap: 10 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  logMessage: { fontSize: 13, fontWeight: '500', color: '#333' },
  logDetail: { fontSize: 12, color: '#c0392b', marginTop: 2 },
  logTime: { fontSize: 11, color: '#999' },
});
