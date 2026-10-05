// Itinerario del viajero: GET /api/itinerario con carga / vacío / error + reintentar.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { EmptyState, ErrorBanner, Badge } from '../../shared/components';
import { TIPO_RESERVA, fmtFecha } from '../../shared/format';

export function ItinerarioScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/itinerario');
      setData(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Mi itinerario</Text>
      <ErrorBanner message={error} />
      {error !== '' && <Text style={styles.retry} onPress={load}>Toca para reintentar</Text>}
      {data === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {data !== null && data.length === 0 && (
        <EmptyState title="Aún no tienes viajes" hint="Cuando compres un viaje aparecerá aquí tu itinerario." />
      )}
      {data !== null && data.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.cardTitle}>{TIPO_RESERVA[r.tipo] || r.tipo} · {r.codigo}</Text>
          <Text style={styles.body}>
            {r.tipo === 'vuelo' ? `${r.origen || '?'} - ${r.destino || '?'}` : r.hotel || 'Hotel'}
          </Text>
          <Text style={styles.muted}>{fmtFecha(r.fecha_inicio)}{r.fecha_fin ? ` — ${fmtFecha(r.fecha_fin)}` : ''}</Text>
          <Badge text={r.estado} color={theme.status[r.estado] || theme.colors.muted} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  retry: { color: theme.colors.primary, fontWeight: 'bold' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 4 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
});
