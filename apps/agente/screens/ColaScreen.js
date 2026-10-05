// Cola de incidentes del agente: orden FIFO por fecha, filtros, paginación y resumen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, fmtFecha } from '../../shared/format';

const ESTADOS = ['Todos', 'Abierto', 'EnGestion', 'Resuelto'];
const PRIORIDADES = ['Todas', 'Baja', 'Alta', 'Critica'];
const LIMIT = 20;

export function ColaScreen({ onOpen, refreshKey }) {
  const insets = useSafeAreaInsets();
  const [estado, setEstado] = useState('Todos');
  const [prioridad, setPrioridad] = useState('Todas');
  const [orden, setOrden] = useState('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [cargando, setCargando] = useState(true);
  const dataRef = useRef(null);
  dataRef.current = data;

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const paginaSegura = Math.min(page, totalPages);

  const load = useCallback(async (p) => {
    setError('');
    const esPrimera = dataRef.current === null;
    if (esPrimera) setCargando(true);
    else setRefreshing(true);
    try {
      const q = `/admin/incidentes?orden=${orden}&page=${p}&limit=${LIMIT}`
        + (estado !== 'Todos' ? `&estado=${estado}` : '')
        + (prioridad !== 'Todas' ? `&prioridad=${prioridad}` : '');
      const [cola, res] = await Promise.all([api.get(q), api.get('/admin/incidentes/resumen')]);
      setData(cola.data);
      setTotal(cola.total ?? 0);
      setResumen(res.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }, [estado, prioridad, orden]);

  useEffect(() => { load(paginaSegura); }, [load, paginaSegura, refreshKey]);

  function cambiarEstado(f) {
    if (f === estado) return;
    setEstado(f);
    setPage(1);
  }

  function cambiarPrioridad(f) {
    if (f === prioridad) return;
    setPrioridad(f);
    setPage(1);
  }

  function cambiarOrden() {
    setOrden((o) => (o === 'asc' ? 'desc' : 'asc'));
    setPage(1);
  }

  function aplicarResumen(r) {
    if (r?.estado && ESTADOS.includes(r.estado)) setEstado(r.estado);
    if (r?.prioridad && PRIORIDADES.includes(r.prioridad)) setPrioridad(r.prioridad);
    setPage(1);
  }

  async function onRefresh() { await load(paginaSegura); }

  const esUltima = paginaSegura >= totalPages;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Cola de incidentes ({total})</Text>
      {resumen.length > 0 && (
        <View style={styles.summary}>
          {resumen.map((r, idx) => (
            <Pressable
              key={idx}
              onPress={() => aplicarResumen(r)}
              style={styles.summaryChip}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${r.estado ?? ''} ${r.prioridad ?? ''}`}
            >
              <Text style={styles.summaryText}>{r.estado}/{r.prioridad}: {r.total}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={styles.label}>Estado</Text>
      <View style={styles.row}>
        {ESTADOS.map((f) => (
          <Pressable key={f} onPress={() => cambiarEstado(f)} style={[styles.chip, estado === f && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, estado === f && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Prioridad</Text>
      <View style={styles.row}>
        {PRIORIDADES.map((f) => (
          <Pressable key={f} onPress={() => cambiarPrioridad(f)} style={[styles.chip, prioridad === f && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, prioridad === f && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable onPress={cambiarOrden} accessibilityRole="button">
          <Text style={styles.link}>Orden fecha: {orden === 'asc' ? 'más antiguos primero' : 'más nuevos primero'} (tocar para cambiar)</Text>
        </Pressable>
      </View>
      <ErrorBanner message={error} />
      {cargando && data === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {data !== null && data.length === 0 && !cargando && (
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
          <Pressable onPress={() => setPage(Math.max(1, paginaSegura - 1))} disabled={paginaSegura <= 1} accessibilityRole="button">
            <Text style={[styles.link, paginaSegura <= 1 && styles.dim]}>Anterior</Text>
          </Pressable>
          <Text style={styles.muted}>Página {paginaSegura} de {totalPages}</Text>
          <Pressable onPress={() => setPage(Math.min(totalPages, paginaSegura + 1))} disabled={esUltima} accessibilityRole="button">
            <Text style={[styles.link, esUltima && styles.dim]}>Siguiente</Text>
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
  summary: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: theme.spacing.sm },
  summaryChip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, minHeight: 40, justifyContent: 'center' },
  summaryText: { fontSize: theme.type.caption, color: theme.colors.primary, fontWeight: 'bold' },
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
