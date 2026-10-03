// Cola de incidentes del agente: orden FIFO por fecha, filtros, paginación y resumen.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, fmtFecha } from '../../shared/format';

const ESTADOS = ['Todos', 'Abierto', 'EnGestion', 'Resuelto'];
const PRIORIDADES = ['Todas', 'Baja', 'Alta', 'Critica'];

export function ColaScreen({ onOpen, refreshKey }) {
  const [estado, setEstado] = useState('Todos');
  const [prioridad, setPrioridad] = useState('Todas');
  const [orden, setOrden] = useState('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p) => {
    setError('');
    try {
      const q = `/admin/incidentes?orden=${orden}&page=${p}&limit=20`
        + (estado !== 'Todos' ? `&estado=${estado}` : '')
        + (prioridad !== 'Todas' ? `&prioridad=${prioridad}` : '');
      const [cola, res] = await Promise.all([api.get(q), api.get('/admin/incidentes/resumen')]);
      setData(cola.data);
      setTotal(cola.total);
      setResumen(res.data);
    } catch (e) {
      setError(e.message);
    }
  }, [estado, prioridad, orden]);

  useEffect(() => { setPage(1); setData(null); load(1); }, [load, refreshKey]);
  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onRefresh() { setRefreshing(true); await load(page); setRefreshing(false); }

  return (
    <ScrollView
      style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Cola de incidentes ({total})</Text>
      {resumen.length > 0 && (
        <View style={styles.summary}>
          {resumen.map((r, idx) => (
            <Text key={idx} style={styles.muted}>{r.estado}/{r.prioridad}: {r.total}   </Text>
          ))}
        </View>
      )}
      <Text style={styles.label}>Estado</Text>
      <View style={styles.row}>
        {ESTADOS.map((f) => (
          <Pressable key={f} onPress={() => setEstado(f)} style={[styles.chip, estado === f && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, estado === f && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Prioridad</Text>
      <View style={styles.row}>
        {PRIORIDADES.map((f) => (
          <Pressable key={f} onPress={() => setPrioridad(f)} style={[styles.chip, prioridad === f && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, prioridad === f && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={() => setOrden(orden === 'asc' ? 'desc' : 'asc')} accessibilityRole="button">
          <Text style={styles.link}>Orden fecha: {orden === 'asc' ? 'más antiguos primero' : 'más nuevos primero'} (tocar para cambiar)</Text>
        </Pressable>
      </View>
      <ErrorBanner message={error} />
      {data === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {data !== null && data.length === 0 && (
        <EmptyState title="Cola vacía" hint="No hay incidentes con esos filtros." />
      )}
      {data !== null && data.map((i) => (
        <Pressable
          key={i.id}
          onPress={() => onOpen(i.id)}
          style={[styles.card, i.prioridad === 'Critica' && styles.critical]}
          accessibilityRole="button"
        >
          <Text style={styles.cardTitle}>#{i.id} · {i.titulo}</Text>
          <Text style={styles.muted}>{TIPO_INCIDENTE[i.tipo] || i.tipo} · {fmtFecha(i.creado_at)}</Text>
          <View style={styles.row}>
            <Badge text={i.estado} color={theme.status[i.estado] || theme.colors.muted} />
            <Badge text={`Prioridad ${i.prioridad}`} color={theme.priority[i.prioridad] || theme.colors.muted} />
          </View>
        </Pressable>
      ))}
      {data !== null && data.length > 0 && (
        <View style={styles.rowBetween}>
          <Pressable onPress={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} accessibilityRole="button">
            <Text style={[styles.link, page <= 1 && styles.dim]}>Anterior</Text>
          </Pressable>
          <Text style={styles.muted}>Página {page}</Text>
          <Pressable onPress={() => setPage(page + 1)} disabled={data.length < 20} accessibilityRole="button">
            <Text style={[styles.link, data.length < 20 && styles.dim]}>Siguiente</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.sm },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: theme.colors.card },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
  dim: { opacity: 0.4 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  critical: { borderLeftColor: theme.colors.critical },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
});
