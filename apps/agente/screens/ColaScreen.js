// Cola simplificada: tabs [Activos | Sin triar | Míos | Resueltos], filtros colapsados,
// sort [Urgentes | Antiguos | Recientes], 3 chips resumen, cards con Reclamar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE } from '../../shared/format';

const TABS = ['Activos', 'Sin triar', 'Míos', 'Resueltos'];
const SORTS = [
  { id: 'urgencia', label: 'Urgentes' },
  { id: 'asc', label: 'Antiguos' },
  { id: 'desc', label: 'Recientes' },
];
const TIPOS = ['Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva', 'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro'];
const PRIO_FILTRO = ['Todas', 'Baja', 'Alta', 'Critica'];
const LIMIT = 20;
const ORDEN_PRIORIDAD = { Critica: 0, Alta: 1, Baja: 2 };

function etiquetaTipo(t) {
  return TIPO_INCIDENTE?.[t] ?? String(t ?? '—').replace(/_/g, ' ');
}

function haceTiempo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d?.getTime?.())) return '—';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'ahora mismo';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 48) return `hace ${hs} h`;
  const dias = Math.floor(hs / 24);
  return `hace ${dias} d`;
}

function slaInfo(item) {
  const iso = item?.sla_vence_at ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d?.getTime?.())) return null;
  const diffMs = d.getTime() - Date.now();
  const vencido = diffMs < 0;
  const absHs = Math.max(0, Math.floor(Math.abs(diffMs) / 3600000));
  const absDias = Math.floor(absHs / 24);
  const resto = absDias >= 2 ? `hace ${absDias} d` : absHs < 1 ? 'menos de 1 h' : `${absHs} h`;
  if (vencido) return { texto: absHs < 1 ? 'Vencido' : `Vencido ${resto}`, vencido: true };
  const falta = absDias >= 2 ? `${absDias} d` : `${absHs} h`;
  return { texto: `Vence en ${falta}`, vencido: false };
}

function asignadoId(item) {
  return item?.asignado?.id ?? item?.asignado_id ?? item?.agente_id ?? null;
}

function asignadoNombre(item) {
  return item?.asignado?.nombre ?? item?.asignado_nombre ?? null;
}

function iniciales(nombre) {
  if (!nombre) return null;
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function etiquetaPrioridad(p) {
  if (!p) return 'Sin triar';
  if (p === 'Critica') return 'Crítica';
  return p;
}

export function ColaScreen({ onOpen, refreshKey, user }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('Activos');
  const [orden, setOrden] = useState('urgencia');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState('Todos');
  const [prioFiltro, setPrioFiltro] = useState('Todas');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [conteos, setConteos] = useState({ sinTriar: null, vencidos: null, mios: null });
  const [yo, setYo] = useState(user ?? null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [reclamando, setReclamando] = useState(null);
  const dataRef = useRef(null);
  dataRef.current = items;

  const totalPages = Math.max(1, Math.ceil((total || 0) / LIMIT));
  const paginaSegura = Math.min(page, totalPages);

  const loadYo = useCallback(async () => {
    if (user?.id != null) { setYo(user); return user; }
    try {
      const r = await api.me();
      const u = r?.user ?? r?.data?.user ?? r?.data ?? null;
      if (u?.id != null) setYo(u);
      return u;
    } catch (e) { return yo; }
  }, [user]);

  const load = useCallback(async (p) => {
    setError('');
    const primera = dataRef.current === null;
    if (primera) setCargando(true);
    else setRefreshing(true);
    try {
      const yoActual = await loadYo().catch(() => yo);
      const yoId = yoActual?.id ?? yo?.id ?? user?.id ?? null;
      const ordenQuery = orden === 'urgencia' ? 'asc' : orden;
      const baseParams = `orden=${ordenQuery}&page=${p}&limit=${LIMIT}`
        + (prioFiltro !== 'Todas' ? `&prioridad=${prioFiltro}` : '')
        + (tipoFiltro !== 'Todos' ? `&tipo=${tipoFiltro}` : '');
      let lista = [];
      let tot = 0;

      if (tab === 'Míos') {
        try {
          const r = await api.get(`/admin/mi-cola?${baseParams}`);
          lista = r?.data ?? r?.items ?? [];
          tot = r?.total ?? lista?.length ?? 0;
        } catch (e) {
          const r = await api.get(`/admin/incidentes?${baseParams}`);
          const todas = r?.data ?? [];
          lista = yoId != null
            ? todas.filter((i) => String(asignadoId(i) ?? '') === String(yoId ?? ''))
            : [];
          tot = lista?.length ?? 0;
        }
      } else {
        let q = `/admin/incidentes?${baseParams}`;
        if (tab === 'Resueltos') q += '&estado=Resuelto';
        const r = await api.get(q);
        const todas = r?.data ?? [];
        const totBackend = r?.total ?? todas?.length ?? 0;
        if (tab === 'Activos') {
          lista = (todas ?? []).filter((i) => ['Abierto', 'EnGestion'].includes(i?.estado));
          // Si backend ya filtró o devolvió solo activos, no vaciar por filtro cliente.
          if (lista.length === 0 && (todas ?? []).length > 0) lista = todas;
          tot = totBackend;
        } else if (tab === 'Sin triar') {
          lista = (todas ?? []).filter((i) => (i?.prioridad ?? null) === null);
          if (lista.length === 0 && (todas ?? []).length > 0 && prioFiltro !== 'Todas') lista = todas;
          tot = lista?.length ?? 0;
        } else {
          lista = todas;
          tot = totBackend;
        }
      }

      // Filtros avanzados también en cliente por si backend no filtra.
      if (tipoFiltro !== 'Todos') lista = (lista ?? []).filter((i) => i?.tipo === tipoFiltro);
      if (prioFiltro !== 'Todas') lista = (lista ?? []).filter((i) => i?.prioridad === prioFiltro);

      setItems(lista ?? []);
      setTotal(tot ?? 0);

      try {
        const res = await api.get('/admin/incidentes/resumen');
        const d = res?.data ?? res ?? null;
        if (d && !Array.isArray(d)) {
          setConteos({
            sinTriar: d?.sin_triar ?? d?.sinTriar ?? null,
            vencidos: d?.vencidos ?? null,
            mios: d?.mios ?? d?.mis ?? null,
          });
        } else {
          setConteos((prev) => ({
            sinTriar: prev.sinTriar ?? (lista ?? []).filter((i) => (i?.prioridad ?? null) === null).length,
            vencidos: prev.vencidos ?? (lista ?? []).filter((i) => (slaInfo(i)?.vencido ?? false)).length,
            mios: prev.mios ?? (yoId != null ? (lista ?? []).filter((i) => String(asignadoId(i) ?? '') === String(yoId)).length : null),
          }));
        }
      } catch (e) { /* resumen opcional */ }
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar la cola.');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }, [tab, orden, tipoFiltro, prioFiltro, loadYo]);

  useEffect(() => { load(paginaSegura); }, [load, paginaSegura, refreshKey]);

  function cambiarTab(t) {
    if (t === tab) return;
    setTab(t);
    setPage(1);
  }

  function irChip(cual) {
    if (cual === 'sinTriar') cambiarTab('Sin triar');
    else if (cual === 'mios') cambiarTab('Míos');
    else cambiarTab('Activos');
  }

  async function reclamar(item) {
    const id = item?.id;
    if (id == null || reclamando) return;
    Alert.alert('Reclamar caso', `Te asignás el caso #${id}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reclamar',
        onPress: async () => {
          setReclamando(id);
          try {
            await api.post(`/admin/incidentes/${id}/claim`, {});
            await load(paginaSegura);
          } catch (e) {
            const msg = e?.status === 409
              ? 'Ya lo reclamó otro agente. Actualizá la cola.'
              : (e?.message ?? 'No se pudo reclamar.');
            setError(msg);
          } finally {
            setReclamando(null);
          }
        },
      },
    ]);
  }

  const visible = useMemo(() => {
    const lista = [...(items ?? [])];
    if (orden === 'urgencia') {
      lista.sort((a, b) => {
        const va = slaInfo(a)?.vencido ? 0 : 1;
        const vb = slaInfo(b)?.vencido ? 0 : 1;
        if (va !== vb) return va - vb;
        const pa = ORDEN_PRIORIDAD[a?.prioridad] ?? 9;
        const pb = ORDEN_PRIORIDAD[b?.prioridad] ?? 9;
        if (pa !== pb) return pa - pb;
        const fa = new Date(a?.creado_at ?? 0).getTime() || 0;
        const fb = new Date(b?.creado_at ?? 0).getTime() || 0;
        return fa - fb;
      });
    } else {
      const dir = orden === 'asc' ? 1 : -1;
      lista.sort((a, b) => {
        const pa = ORDEN_PRIORIDAD[a?.prioridad] ?? 9;
        const pb = ORDEN_PRIORIDAD[b?.prioridad] ?? 9;
        if (pa !== pb) return pa - pb;
        const fa = new Date(a?.creado_at ?? 0).getTime() || 0;
        const fb = new Date(b?.creado_at ?? 0).getTime() || 0;
        return (fa - fb) * dir;
      });
    }
    return lista;
  }, [items, orden]);

  const esUltima = paginaSegura >= totalPages;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(paginaSegura)} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Cola ({total})</Text>

      <View style={styles.chipsResumen}>
        {[
          { id: 'sinTriar', label: 'Sin triar', n: conteos?.sinTriar },
          { id: 'vencidos', label: 'Vencidos', n: conteos?.vencidos },
          { id: 'mios', label: 'Míos', n: conteos?.mios },
        ].map((c) => (
          <Pressable
            key={c.id}
            onPress={() => irChip(c.id)}
            style={styles.chipGrande}
            accessibilityRole="button"
            accessibilityLabel={`Ver ${c.label} ${c.n ?? ''}`}
          >
            <Text style={styles.chipGrandeN}>{c.n ?? '—'}</Text>
            <Text style={styles.chipGrandeT}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Secciones de la cola">
        {TABS.map((t) => {
          const activo = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => cambiarTab(t)}
              style={[styles.tab, activo && styles.tabActivo]}
              accessibilityRole="tab"
              accessibilityLabel={`Sección ${t}`}
              accessibilityState={{ selected: activo }}
            >
              <Text style={[styles.tabTexto, activo && styles.tabTextoActivo]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => setFiltrosAbiertos((v) => !v)}
        style={styles.filtrosBtn}
        accessibilityRole="button"
        accessibilityLabel={filtrosAbiertos ? 'Ocultar filtros' : 'Mostrar filtros'}
        accessibilityState={{ expanded: filtrosAbiertos }}
      >
        <Text style={styles.filtrosTexto}>Filtros {filtrosAbiertos ? '▾' : '▸'}</Text>
      </Pressable>
      {filtrosAbiertos && (
        <View style={styles.filtrosBox}>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.row}>
            {['Todos', ...TIPOS].map((t) => (
              <Pressable
                key={t}
                onPress={() => { setTipoFiltro(t); setPage(1); }}
                style={[styles.chip, tipoFiltro === t && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Filtrar por tipo ${t}`}
                accessibilityState={{ selected: tipoFiltro === t }}
              >
                <Text style={[styles.chipText, tipoFiltro === t && styles.chipTextActive]}>
                  {t === 'Todos' ? 'Todos' : etiquetaTipo(t)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.row}>
            {PRIO_FILTRO.map((p) => (
              <Pressable
                key={p}
                onPress={() => { setPrioFiltro(p); setPage(1); }}
                style={[styles.chip, prioFiltro === p && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Filtrar por prioridad ${p}`}
                accessibilityState={{ selected: prioFiltro === p }}
              >
                <Text style={[styles.chipText, prioFiltro === p && styles.chipTextActive]}>
                  {p === 'Critica' ? 'Crítica' : p}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Orden de la cola">
        {SORTS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => { if (s.id !== orden) { setOrden(s.id); setPage(1); } }}
            style={[styles.segBtn, orden === s.id && styles.segActive]}
            accessibilityRole="radio"
            accessibilityLabel={`Ordenar ${s.label.toLowerCase()}`}
            accessibilityState={{ selected: orden === s.id }}
          >
            <Text style={[styles.segText, orden === s.id && styles.segTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorBanner message={error} />
      {error !== '' && <AppButton title="Reintentar" variant="ghost" onPress={() => load(paginaSegura)} />}
      {cargando && items === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {items !== null && visible.length === 0 && !cargando && error === '' && (
        <EmptyState title="Cola vacía" hint="No hay casos en esta sección." />
      )}

      {visible.map((i) => {
        const sla = slaInfo(i);
        const nombre = asignadoNombre(i);
        const ini = iniciales(nombre);
        const sinAsignar = asignadoId(i) == null && !nombre;
        const respuestasN = i?.respuestas_n ?? i?.respuestas_count ?? i?.conteo_respuestas ?? null;
        return (
          <Pressable
            key={i?.id}
            onPress={() => onOpen?.(i?.id)}
            style={styles.card}
            accessibilityRole="button"
            accessibilityLabel={`Abrir caso ${i?.id ?? ''} ${i?.titulo ?? ''}`}
          >
            <Text style={styles.cardTitle}>#{i?.id ?? '—'} · {i?.titulo ?? 'Sin título'}</Text>
            {!!i?.descripcion && <Text style={styles.body} numberOfLines={2}>{i.descripcion}</Text>}
            <Text style={styles.muted}>
              {haceTiempo(i?.creado_at ?? i?.actualizado_at)}
              {sla ? ` · ${sla.texto}` : ''}
              {respuestasN != null ? ` · ${respuestasN} resp.` : ''}
            </Text>
            {sla?.vencido && <Text style={styles.vencido}>Vencido · atención inmediata</Text>}
            <View style={styles.row}>
              <Badge text={i?.estado === 'EnGestion' ? 'En gestión' : (i?.estado ?? '—')} color={theme.status?.[i?.estado] || theme.colors.muted} />
              <Badge text={etiquetaPrioridad(i?.prioridad)} color={theme.priority?.[i?.prioridad] || theme.colors.muted} />
              <View style={styles.asignado} accessibilityLabel={nombre ? `Asignado a ${nombre}` : 'Sin asignar'}>
                <Text style={styles.asignadoTexto}>{ini ?? 'Sin asignar'}</Text>
              </View>
            </View>
            {sinAsignar && (
              <Pressable
                onPress={() => reclamar(i)}
                disabled={reclamando === i?.id}
                style={styles.reclamarBtn}
                accessibilityRole="button"
                accessibilityLabel={`Reclamar caso ${i?.id ?? ''}`}
              >
                <Text style={styles.reclamarTexto}>{reclamando === i?.id ? 'Reclamando…' : 'Reclamar'}</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}

      {items !== null && visible.length > 0 && (
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
          <Text style={styles.muted}>Página {paginaSegura} de {totalPages}</Text>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipsResumen: { flexDirection: 'row', gap: theme.spacing.sm },
  chipGrande: { flex: 1, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, minHeight: 64, justifyContent: 'center' },
  chipGrandeN: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  chipGrandeT: { fontSize: theme.type.caption, color: theme.colors.muted },
  tabs: { flexDirection: 'row', gap: theme.spacing.sm },
  tab: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, paddingHorizontal: 4 },
  tabActivo: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  tabTexto: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: 'bold', textAlign: 'center' },
  tabTextoActivo: { color: theme.colors.primary },
  filtrosBtn: { minHeight: 44, justifyContent: 'center' },
  filtrosTexto: { color: theme.colors.primary, fontWeight: 'bold' },
  filtrosBox: { gap: theme.spacing.sm, backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: theme.colors.card },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  segmented: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, borderRadius: 999, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.sm },
  segActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: 'bold' },
  segTextActive: { color: '#fff' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
  dim: { opacity: 0.4 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  vencido: { color: theme.colors.critical, fontWeight: 'bold', fontSize: theme.type.caption },
  asignado: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 4 },
  asignadoTexto: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  reclamarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  reclamarTexto: { color: '#fff', fontWeight: 'bold' },
});
