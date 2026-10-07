// Cola de incidentes del agente: orden FIFO por fecha, filtros, paginación y resumen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE } from '../../shared/format';

const ESTADOS = ['Todos', 'Abierto', 'EnGestion', 'Resuelto'];
const PRIORIDADES = ['Todas', 'Baja', 'Alta', 'Critica'];
const LIMIT = 20;
const ORDEN_PRIORIDAD = { Critica: 0, Alta: 1, Baja: 2 };

function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function haceTiempo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'ahora mismo';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const dias = Math.floor(hs / 24);
  return `hace ${dias} d`;
}

function etiquetaEstado(e) {
  if (e === 'EnGestion') return 'En gestión';
  return e;
}

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
      setData(cola?.data ?? []);
      setTotal(cola?.total ?? 0);
      setResumen(res?.data ?? []);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar la cola.');
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

  function cambiarOrden(nuevo) {
    if (nuevo === orden) return;
    setOrden(nuevo);
    setPage(1);
  }

  function aplicarResumen(r) {
    if (r?.estado && ESTADOS.includes(r.estado)) setEstado(r.estado);
    if (r?.prioridad && PRIORIDADES.includes(r.prioridad)) setPrioridad(r.prioridad);
    setPage(1);
  }

  async function onRefresh() { await load(paginaSegura); }

  function conteoEstado(f) {
    if (f === 'Todos') return total;
    return (resumen ?? []).filter((r) => r?.estado === f).reduce((acc, r) => acc + (Number(r?.total) || 0), 0);
  }

  function conteoPrioridad(f) {
    if (f === 'Todas') return total;
    return (resumen ?? []).filter((r) => r?.prioridad === f).reduce((acc, r) => acc + (Number(r?.total) || 0), 0);
  }

  const ordenada = useMemo(() => {
    const lista = [...(data ?? [])];
    const dir = orden === 'asc' ? 1 : -1;
    lista.sort((a, b) => {
      const pa = ORDEN_PRIORIDAD[a?.prioridad] ?? 9;
      const pb = ORDEN_PRIORIDAD[b?.prioridad] ?? 9;
      if (pa !== pb) return pa - pb;
      const fa = new Date(a?.creado_at ?? 0).getTime() || 0;
      const fb = new Date(b?.creado_at ?? 0).getTime() || 0;
      return (fa - fb) * dir;
    });
    return lista;
  }, [data, orden]);

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
              accessibilityLabel={`Filtrar por ${r?.estado ?? ''} ${r?.prioridad ?? ''}`}
            >
              <Text style={styles.summaryText}>{r?.estado ?? '—'}/{r?.prioridad ?? '—'}: {r?.total ?? 0}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Text style={styles.label}>Estado</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {ESTADOS.map((f) => {
          const activo = estado === f;
          const n = conteoEstado(f);
          return (
            <Pressable
              key={f}
              onPress={() => cambiarEstado(f)}
              style={[styles.chip, activo && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por estado ${etiquetaEstado(f)}`}
              accessibilityState={{ selected: activo }}
            >
              <Text style={[styles.chipText, activo && styles.chipTextActive]}>{etiquetaEstado(f)}{n > 0 ? ` (${n})` : ''}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.label}>Prioridad</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {PRIORIDADES.map((f) => {
          const activo = prioridad === f;
          const n = conteoPrioridad(f);
          const etiqueta = f === 'Critica' ? 'Crítica' : f === 'Todas' ? 'Todas' : f;
          return (
            <Pressable
              key={f}
              onPress={() => cambiarPrioridad(f)}
              style={[styles.chip, activo && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por prioridad ${etiqueta}`}
              accessibilityState={{ selected: activo }}
            >
              <Text style={[styles.chipText, activo && styles.chipTextActive]}>{etiqueta}{n > 0 ? ` (${n})` : ''}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.label}>Orden</Text>
      <View
        style={styles.segmented}
        accessibilityRole="radiogroup"
        accessibilityLabel="Orden de la cola"
      >
        <Pressable
          onPress={() => cambiarOrden('asc')}
          style={[styles.segBtn, orden === 'asc' && styles.segActive]}
          accessibilityRole="radio"
          accessibilityLabel="Ordenar antiguos primero"
          accessibilityState={{ selected: orden === 'asc' }}
        >
          <Text style={[styles.segText, orden === 'asc' && styles.segTextActive]}>FIFO: antiguos primero</Text>
        </Pressable>
        <Pressable
          onPress={() => cambiarOrden('desc')}
          style={[styles.segBtn, orden === 'desc' && styles.segActive]}
          accessibilityRole="radio"
          accessibilityLabel="Ordenar recientes primero"
          accessibilityState={{ selected: orden === 'desc' }}
        >
          <Text style={[styles.segText, orden === 'desc' && styles.segTextActive]}>Recientes</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>Dentro de cada modo se ordena por prioridad y luego por fecha.</Text>
      <ErrorBanner message={error} />
      {error !== '' && (
        <AppButton title="Reintentar" variant="ghost" onPress={() => load(paginaSegura)} />
      )}
      {cargando && data === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {data !== null && data.length === 0 && !cargando && error === '' && (
        <EmptyState title="Cola vacía" hint="No hay incidentes con esos filtros." />
      )}
      {data !== null && data.length === 0 && !cargando && error !== '' && (
        <EmptyState title="No se pudo cargar" hint="Revisá tu conexión e intentá de nuevo." actionTitle="Reintentar" onAction={() => load(paginaSegura)} />
      )}
      {ordenada.map((i) => {
        const esCritica = i?.prioridad === 'Critica';
        return (
          <Pressable
            key={i?.id}
            onPress={() => onOpen?.(i?.id)}
            style={[styles.card, esCritica && styles.critical]}
            accessibilityRole="button"
            accessibilityLabel={`Abrir incidente ${i?.id ?? ''} ${i?.titulo ?? ''}`}
          >
            <Text style={styles.cardTitle}>#{i?.id ?? '—'} · {i?.titulo ?? 'Sin título'}</Text>
            {!!i?.descripcion && (
              <Text style={styles.body} numberOfLines={2}>{i.descripcion}</Text>
            )}
            <Text style={styles.muted}>{TIPO_INCIDENTE[i?.tipo] || i?.tipo || '—'} · {fechaHora(i?.creado_at)} · {haceTiempo(i?.creado_at)}</Text>
            {esCritica && <Text style={styles.criticalText}>CRÍTICA · requiere atención inmediata</Text>}
            <View style={styles.row}>
              <Badge text={etiquetaEstado(i?.estado ?? '—')} color={theme.status[i?.estado] || theme.colors.muted} />
              <Badge text={`Prioridad ${i?.prioridad === 'Critica' ? 'Crítica' : (i?.prioridad ?? '—')}`} color={theme.priority[i?.prioridad] || theme.colors.muted} />
            </View>
          </Pressable>
        );
      })}
      {data !== null && data.length > 0 && (
        <View style={styles.rowBetween}>
          <Pressable
            onPress={() => setPage(Math.max(1, paginaSegura - 1))}
            disabled={paginaSegura <= 1}
            accessibilityRole="button"
            accessibilityLabel="Ir a página anterior"
            accessibilityState={{ disabled: paginaSegura <= 1 }}
          >
            <Text style={[styles.link, paginaSegura <= 1 && styles.dim]}>Anterior</Text>
          </Pressable>
          <Text style={styles.muted} accessibilityLabel={`Página ${paginaSegura} de ${totalPages}`}>Página {paginaSegura} de {totalPages}</Text>
          <Pressable
            onPress={() => setPage(Math.min(totalPages, paginaSegura + 1))}
            disabled={esUltima}
            accessibilityRole="button"
            accessibilityLabel="Ir a página siguiente"
            accessibilityState={{ disabled: esUltima }}
          >
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
  chipRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.md },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: theme.colors.card },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  segmented: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, borderRadius: 999, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.sm },
  segActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: 'bold', textAlign: 'center' },
  segTextActive: { color: '#fff' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
  dim: { opacity: 0.4 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6, borderLeftWidth: 4, borderLeftColor: 'transparent' },
  critical: { borderLeftColor: theme.colors.critical, borderWidth: 1, borderColor: theme.colors.critical },
  criticalText: { color: theme.colors.critical, fontWeight: 'bold', fontSize: theme.type.caption },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
});
