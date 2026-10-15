// Avisos in-app (Fase 4b): lista paginada + marcar leídas. Polling ya en header.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';
import { api } from './api';
import { AppButton, EmptyState, ErrorBanner, LoadingRow } from './components';
import { fmtFecha } from './format';

export function NotificacionesScreen() {
  const [data, setData] = useState(null);
  const [noLeidas, setNoLeidas] = useState(0);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/notificaciones?limit=30');
      setData(r?.data ?? []);
      setNoLeidas(r?.no_leidas ?? 0);
    } catch (e) {
      setError(e?.message ?? 'No pudimos cargar los avisos.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function leer(id) {
    try {
      await api.post(`/notificaciones/${id}/leer`, {});
      await load();
    } catch (e) {
      setError(e?.message ?? 'No pudimos marcar el aviso.');
    }
  }

  async function leerTodas() {
    try {
      await api.post('/notificaciones/leer-todas', {});
      await load();
    } catch (e) {
      setError(e?.message ?? 'No pudimos marcar los avisos.');
    }
  }

  function fila({ item: n }) {
    return (
      <Pressable onPress={() => !n?.leida && leer(n?.id)} style={[styles.card, !n?.leida && styles.nueva]} accessibilityRole="button">
        <Text style={styles.body}>{n?.texto ?? '—'}</Text>
        <Text style={styles.muted}>
          {n?.incidente_id ? `Caso #${n.incidente_id} · ` : ''}{fmtFecha(n?.creado_at)}{n?.leida ? '' : ' · Nuevo'}
        </Text>
      </Pressable>
    );
  }

  return (
    <FlatList
      style={styles.root} contentContainerStyle={styles.content}
      data={data ?? []} keyExtractor={(n) => String(n?.id)}
      renderItem={fila}
      ListHeaderComponent={(
        <View style={styles.head}>
          <Text style={styles.title}>Avisos{noLeidas > 0 ? ` (${noLeidas} nuevos)` : ''}</Text>
          <ErrorBanner message={error} />
          {noLeidas > 0 && <AppButton title="Marcar todos leídos" onPress={leerTodas} variant="ghost" />}
        </View>
      )}
      ListEmptyComponent={data === null && error === '' ? <LoadingRow text="Cargando avisos…" /> : <EmptyState title="Sin avisos" hint="Acá aparecen respuestas, asignaciones y vencimientos." />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  head: { gap: theme.spacing.sm },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4 },
  nueva: { borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceHighlight },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
});
