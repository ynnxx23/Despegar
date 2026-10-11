// Cola del agente: pestañas (activos, sin triar, míos, siguiendo, resueltos),
// filtros, orden y cards con reclamar/seguir.
// Los filtros y el orden los aplica el servidor: la app no reordena ni re-cuenta
// por su cuenta (así la paginación y los contadores siempre coinciden).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { Badge, Chip, EmptyState, ErrorBanner } from '../../shared/components';
import { etiquetaEstado, etiquetaPrioridad, etiquetaTipo } from '../../shared/format';

const TABS = ['Activos', 'Sin triar', 'Míos', 'Siguiendo', 'Resueltos'];
const SORTS = [
  { id: 'urgencia', label: 'Urgentes' },
  { id: 'asc', label: 'Antiguos' },
  { id: 'desc', label: 'Recientes' },
];
const TIPOS = ['Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva', 'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro'];
const PRIO_FILTRO = ['Todas', 'Baja', 'Alta', 'Critica'];
const LIMITE = 20;

function haceTiempo(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d?.getTime?.())) return '—';
  const minutos = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

function infoSla(caso) {
  const iso = caso?.sla_vence_at ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d?.getTime?.())) return null;
  const ms = d.getTime() - Date.now();
  const vencido = ms < 0;
  const horas = Math.floor(Math.abs(ms) / 3600000);
  const dias = Math.floor(horas / 24);
  const resto = dias >= 2 ? `hace ${dias} d` : horas < 1 ? 'menos de 1 h' : `${horas} h`;
  if (vencido) return { texto: horas < 1 ? 'Vencido' : `Vencido ${resto}`, vencido: true };
  return { texto: `Vence en ${dias >= 2 ? `${dias} d` : horas < 1 ? 'menos de 1 h' : `${horas} h`}`, vencido: false };
}

function iniciales(nombre) {
  if (!nombre) return null;
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function idAsignado(caso) {
  return caso?.asignado?.id ?? caso?.asignado_id ?? caso?.asignado_a ?? caso?.agente_id ?? null;
}

function nombreAsignado(caso) {
  return caso?.asignado?.nombre ?? caso?.asignado_nombre ?? null;
}

function CasoCard({ caso, yo, reclamando, siguiendoId, onOpen, onReclamar, onSeguir }) {
  const sla = infoSla(caso);
  const nombre = nombreAsignado(caso);
  const sinAsignar = idAsignado(caso) == null && !nombre;
  const loSigo = caso?.siguiendo === true;
  const seguidores = caso?.seguidores_count ?? 0;
  const esMio = yo?.id != null && idAsignado(caso) != null && String(idAsignado(caso)) === String(yo.id);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => onOpen?.(caso?.id)}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityLabel={`Abrir caso ${caso?.id ?? ''}: ${caso?.titulo ?? 'Sin título'}`}
      >
        <Text style={styles.cardTitle}>#{caso?.id ?? '—'} · {caso?.titulo ?? 'Sin título'}</Text>
        {!!caso?.descripcion && <Text style={styles.body} numberOfLines={2}>{caso.descripcion}</Text>}
        <Text style={styles.muted}>
          {haceTiempo(caso?.creado_at ?? caso?.actualizado_at)}
          {sla ? ` · ${sla.texto}` : ''}
        </Text>
        {sla?.vencido && <Text style={styles.vencido}>Vencido · atención inmediata</Text>}
      </Pressable>

      <View style={styles.row}>
        <Badge text={etiquetaEstado(caso?.estado) || '—'} color={theme.status?.[caso?.estado] || theme.colors.muted} label="Estado" />
        <Badge text={etiquetaPrioridad(caso?.prioridad)} color={theme.priority?.[caso?.prioridad] || theme.colors.muted} label="Prioridad" />
        {nombre ? (
          <Badge text={esMio ? 'Lo tenés vos' : `Reclamado por ${nombre}`} color={theme.colors.primary} />
        ) : (
          <Badge text="Sin reclamar" color={theme.colors.muted} />
        )}
        {loSigo && <Badge text="Siguiendo" color={theme.colors.primary} />}
        {!loSigo && seguidores > 0 && <Badge text={`${seguidores} sig.`} color={theme.colors.muted} />}
        <View style={styles.asignado} accessibilityLabel={nombre ? `Asignado a ${nombre}` : 'Sin asignar'}>
          <Text style={styles.asignadoTexto}>{iniciales(nombre) ?? 'Sin asignar'}</Text>
        </View>
      </View>

      <View style={styles.accionesFila}>
        {sinAsignar && (
          <Pressable
            onPress={() => onReclamar(caso)}
            disabled={reclamando === caso?.id}
            style={styles.reclamarBtn}
            accessibilityRole="button"
            accessibilityLabel={`Reclamar caso ${caso?.id ?? ''}`}
            accessibilityState={{ disabled: reclamando === caso?.id, busy: reclamando === caso?.id }}
          >
            <Text style={styles.reclamarTexto}>{reclamando === caso?.id ? 'Reclamando…' : 'Reclamar'}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => onSeguir(caso)}
          disabled={siguiendoId === caso?.id}
          style={[styles.reclamarBtn, loSigo && styles.reclamarBtnOn]}
          accessibilityRole="button"
          accessibilityLabel={loSigo ? `Dejar de seguir caso ${caso?.id ?? ''}` : `Seguir caso ${caso?.id ?? ''}`}
          accessibilityState={{ disabled: siguiendoId === caso?.id, selected: loSigo }}
        >
          <Text style={[styles.reclamarTexto, loSigo && styles.reclamarTextoOn]}>
            {siguiendoId === caso?.id ? 'Actualizando…' : (loSigo ? 'Dejar de seguir' : 'Seguir')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
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
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [reclamando, setReclamando] = useState(null);
  const [siguiendoId, setSiguiendoId] = useState(null);

  const totalPaginas = Math.max(1, Math.ceil((total || 0) / LIMITE));
  const pagina = Math.min(page, totalPaginas);

  // Arma la query segun la pestaña y los filtros (todo se filtra en el servidor).
  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('orden', orden);
    p.set('page', String(page));
    p.set('limit', String(LIMITE));
    if (tab === 'Activos') p.set('estado', 'activos');
    if (tab === 'Sin triar') { p.set('estado', 'activos'); p.set('prioridad', 'sin_triar'); }
    if (tab === 'Resueltos') p.set('estado', 'Resuelto');
    if (tab === 'Míos' || tab === 'Siguiendo') p.set('vista', tab === 'Míos' ? 'mios' : 'siguiendo');
    if (prioFiltro !== 'Todas' && tab !== 'Sin triar') p.set('prioridad', prioFiltro);
    if (tipoFiltro !== 'Todos') p.set('tipo', tipoFiltro);
    return p.toString();
  }, [tab, orden, page, prioFiltro, tipoFiltro]);

  const cargar = useCallback(async (paginaPedida) => {
    setError('');
    if (items === null) setCargando(true);
    const p = new URLSearchParams(query);
    p.set('page', String(paginaPedida));
    const esPropia = tab === 'Míos' || tab === 'Siguiendo';
    const url = esPropia ? `/admin/mi-cola?${p.toString()}` : `/admin/incidentes?${p.toString()}`;
    try {
      const r = await api.get(url);
      setItems(Array.isArray(r?.data) ? r.data : []);
      setTotal(typeof r?.total === 'number' ? r.total : 0);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar la cola.');
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }, [query, tab, items]);

  // Contadores globales del panel (vienen en la raiz de la respuesta).
  const cargarResumen = useCallback(async () => {
    try {
      const r = await api.get('/admin/incidentes/resumen');
      setConteos({
        sinTriar: r?.sin_triar ?? null,
        vencidos: r?.vencidos ?? null,
        mios: r?.mios ?? null,
      });
    } catch (e) {
      setConteos({ sinTriar: null, vencidos: null, mios: null });
    }
  }, []);

  useEffect(() => { cargar(pagina); }, [cargar, pagina, refreshKey]);
  useEffect(() => { cargarResumen(); }, [cargarResumen, refreshKey]);

  function cambiarTab(nueva) {
    if (nueva === tab) return;
    setTab(nueva);
    setPage(1);
  }

  function irAResumen(cual) {
    if (cual === 'mios') cambiarTab('Míos');
    else if (cual === 'sinTriar') cambiarTab('Sin triar');
    else cambiarTab('Activos');
  }

  async function recargar() {
    setRefreshing(true);
    await Promise.all([cargar(pagina), cargarResumen()]);
    setRefreshing(false);
  }

  async function reclamar(caso) {
    const id = caso?.id;
    if (id == null || reclamando) return;
    Alert.alert('Reclamar caso', `Te asignás el caso #${id}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reclamar',
        onPress: async () => {
          setReclamando(id);
          try {
            await api.post(`/admin/incidentes/${id}/claim`, {});
            await recargar();
          } catch (e) {
            setError(e?.status === 409
              ? 'Ya lo reclamó otro agente. Actualizá la cola.'
              : (e?.message ?? 'No se pudo reclamar.'));
          } finally {
            setReclamando(null);
          }
        },
      },
    ]);
  }

  async function seguir(caso) {
    const id = caso?.id;
    if (id == null || siguiendoId != null) return;
    setSiguiendoId(id);
    setError('');
    try {
      if (caso?.siguiendo === true) {
        await api.del(`/admin/incidentes/${id}/seguir`);
      } else {
        await api.post(`/admin/incidentes/${id}/seguir`, {});
      }
      await recargar();
    } catch (e) {
      setError(e?.message ?? 'No se pudo actualizar el seguimiento.');
    } finally {
      setSiguiendoId(null);
    }
  }

  const esUltima = pagina >= totalPaginas;

  const header = (
    <View style={styles.headerCol}>
      <Text style={styles.title}>Cola ({total})</Text>

      <View style={styles.chipsResumen}>
        {[
          { id: 'sinTriar', label: 'Sin triar', n: conteos?.sinTriar },
          { id: 'vencidos', label: 'Vencidos', n: conteos?.vencidos },
          { id: 'mios', label: 'Míos', n: conteos?.mios },
        ].map((c) => (
          <Pressable
            key={c.id}
            onPress={() => irAResumen(c.id)}
            style={styles.chipGrande}
            accessibilityRole="button"
            accessibilityLabel={`Ver ${c.label}: ${c.n ?? 'sin datos'}`}
          >
            <Text style={styles.chipGrandeN}>{c.n ?? '—'}</Text>
            <Text style={styles.chipGrandeT}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tabs} accessibilityLabel="Secciones de la cola">
        {TABS.map((t) => (
          <Pressable
            key={t}
            onPress={() => cambiarTab(t)}
            style={[styles.tab, tab === t && styles.tabActivo]}
            accessibilityRole="button"
            accessibilityLabel={`Sección ${t}`}
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabTexto, tab === t && styles.tabTextoActivo]}>{t}</Text>
          </Pressable>
        ))}
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
              <Chip
                key={t}
                label={t === 'Todos' ? 'Todos' : etiquetaTipo(t)}
                active={tipoFiltro === t}
                onPress={() => { setTipoFiltro(t); setPage(1); }}
                accessibilityLabel={`Filtrar por tipo ${t === 'Todos' ? 'Todos' : etiquetaTipo(t)}`}
              />
            ))}
          </View>
          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.row}>
            {PRIO_FILTRO.map((p) => (
              <Chip
                key={p}
                label={p === 'Critica' ? 'Crítica' : p}
                active={prioFiltro === p}
                onPress={() => { setPrioFiltro(p); setPage(1); }}
                accessibilityLabel={`Filtrar por prioridad ${p}`}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.segmented} accessibilityLabel="Orden de la cola">
        {SORTS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => { setOrden(s.id); setPage(1); }}
            style={[styles.segBtn, orden === s.id && styles.segActive]}
            accessibilityRole="button"
            accessibilityLabel={`Ordenar por ${s.label}`}
            accessibilityState={{ selected: orden === s.id }}
          >
            <Text style={[styles.segText, orden === s.id && styles.segTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorBanner message={error} onRetry={() => recargar()} />
      {cargando && items === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
    </View>
  );

  const pie = (
    <View style={styles.rowBetween}>
      <Pressable
        onPress={() => setPage(Math.max(1, pagina - 1))}
        disabled={pagina <= 1}
        style={styles.linkBtn}
        accessibilityRole="button"
        accessibilityLabel="Ir a la página anterior"
        accessibilityState={{ disabled: pagina <= 1 }}
      >
        <Text style={[styles.link, pagina <= 1 && styles.dim]}>Anterior</Text>
      </Pressable>
      <Text style={styles.muted}>Página {pagina} de {totalPaginas}</Text>
      <Pressable
        onPress={() => setPage(Math.min(totalPaginas, pagina + 1))}
        disabled={esUltima}
        style={styles.linkBtn}
        accessibilityRole="button"
        accessibilityLabel="Ir a la página siguiente"
        accessibilityState={{ disabled: esUltima }}
      >
        <Text style={[styles.link, esUltima && styles.dim]}>Siguiente</Text>
      </Pressable>
    </View>
  );

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
      data={items ?? []}
      keyExtractor={(caso) => String(caso?.id)}
      renderItem={({ item }) => (
        <CasoCard
          caso={item}
          yo={user}
          reclamando={reclamando}
          siguiendoId={siguiendoId}
          onOpen={onOpen}
          onReclamar={reclamar}
          onSeguir={seguir}
        />
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={
        items !== null && !cargando && error === ''
          ? <EmptyState title="Cola vacía" hint="No hay casos en esta sección." />
          : null
      }
      ListFooterComponent={items && items.length > 0 ? pie : null}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={recargar} colors={[theme.colors.primary]} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  headerCol: { gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chipsResumen: { flexDirection: 'row', gap: theme.spacing.sm },
  chipGrande: { flex: 1, backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, minHeight: 64, justifyContent: 'center' },
  chipGrandeN: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  chipGrandeT: { fontSize: theme.type.caption, color: theme.colors.muted },
  tabs: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  tab: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card, paddingHorizontal: theme.spacing.md },
  tabActivo: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  tabTexto: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: 'bold', textAlign: 'center' },
  tabTextoActivo: { color: theme.colors.primary },
  filtrosBtn: { minHeight: 44, justifyContent: 'center' },
  filtrosTexto: { color: theme.colors.primary, fontWeight: 'bold' },
  filtrosBox: { gap: theme.spacing.sm, backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border },
  segmented: { flexDirection: 'row', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, padding: 4, gap: 4 },
  segBtn: { flex: 1, borderRadius: 999, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.sm },
  segActive: { backgroundColor: theme.colors.primary },
  segText: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: 'bold' },
  segTextActive: { color: '#fff' },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
  dim: { opacity: 0.4 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardHeader: { gap: 4 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  vencido: { color: theme.colors.criticalText, fontWeight: 'bold', fontSize: theme.type.caption },
  asignado: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 4 },
  asignadoTexto: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  accionesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' },
  reclamarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: theme.spacing.md },
  reclamarTexto: { color: '#fff', fontWeight: 'bold' },
  reclamarBtnOn: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.primary },
  reclamarTextoOn: { color: theme.colors.primary },
});
