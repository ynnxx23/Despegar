// Cola del agente: pestañas (activos, sin triar, míos, siguiendo, resueltos),
// filtros, orden y cards con reclamar/seguir.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { etiquetaPrioridad, etiquetaTipo } from '../../shared/format';

const TABS = ['Activos', 'Sin triar', 'Míos', 'Siguiendo', 'Resueltos'];
const SORTS = [
  { id: 'urgencia', label: 'Urgentes' },
  { id: 'asc', label: 'Antiguos' },
  { id: 'desc', label: 'Recientes' },
];
const TIPOS = ['Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva', 'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro'];
const PRIO_FILTRO = ['Todas', 'Baja', 'Alta', 'Critica'];
const LIMITE = 20;
const ORDEN_PRIORIDAD = { Critica: 0, Alta: 1, Baja: 2 };

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
  const respuestas = caso?.respuestas_n ?? caso?.respuestas_count ?? caso?.conteo_respuestas ?? null;

  return (
    <Pressable
      onPress={() => onOpen?.(caso?.id)}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Abrir caso ${caso?.id ?? ''} ${caso?.titulo ?? ''}`}
    >
      <Text style={styles.cardTitle}>#{caso?.id ?? '—'} · {caso?.titulo ?? 'Sin título'}</Text>
      {!!caso?.descripcion && <Text style={styles.body} numberOfLines={2}>{caso.descripcion}</Text>}
      <Text style={styles.muted}>
        {haceTiempo(caso?.creado_at ?? caso?.actualizado_at)}
        {sla ? ` · ${sla.texto}` : ''}
        {respuestas != null ? ` · ${respuestas} resp.` : ''}
      </Text>
      {sla?.vencido && <Text style={styles.vencido}>Vencido · atención inmediata</Text>}

      <View style={styles.row}>
        <Badge text={caso?.estado === 'EnGestion' ? 'En gestión' : (caso?.estado ?? '—')} color={theme.status?.[caso?.estado] || theme.colors.muted} />
        <Badge text={etiquetaPrioridad(caso?.prioridad)} color={theme.priority?.[caso?.prioridad] || theme.colors.muted} />
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
        >
          <Text style={[styles.reclamarTexto, loSigo && styles.reclamarTextoOn]}>
            {siguiendoId === caso?.id ? 'Actualizando…' : (loSigo ? 'Dejar de seguir' : 'Seguir')}
          </Text>
        </Pressable>
      </View>
    </Pressable>
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
  const [yo, setYo] = useState(user ?? null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [reclamando, setReclamando] = useState(null);
  const [siguiendoId, setSiguiendoId] = useState(null);
  const cargadoUnaVez = useRef(false);

  const totalPaginas = Math.max(1, Math.ceil((total || 0) / LIMITE));
  const pagina = Math.min(page, totalPaginas);

  const cargarYo = useCallback(async () => {
    if (user?.id != null) { setYo(user); return user; }
    try {
      const r = await api.me();
      const u = r?.user ?? r?.data?.user ?? r?.data ?? null;
      if (u?.id != null) setYo(u);
      return u;
    } catch (e) {
      return yo;
    }
  }, [user, yo]);

  const cargar = useCallback(async (paginaPedida) => {
    setError('');
    if (!cargadoUnaVez.current) setCargando(true);
    else setRefreshing(true);
    try {
      const yoActual = await cargarYo().catch(() => yo);
      const yoId = yoActual?.id ?? yo?.id ?? user?.id ?? null;
      const ordenQuery = orden === 'urgencia' ? 'asc' : orden;
      const params = `orden=${ordenQuery}&page=${paginaPedida}&limit=${LIMITE}`
        + (prioFiltro !== 'Todas' ? `&prioridad=${prioFiltro}` : '')
        + (tipoFiltro !== 'Todos' ? `&tipo=${tipoFiltro}` : '');

      let lista = [];
      let totalActual = 0;

      if (tab === 'Míos' || tab === 'Siguiendo') {
        const vista = tab === 'Míos' ? 'mios' : 'siguiendo';
        try {
          const r = await api.get(`/admin/mi-cola?vista=${vista}&${params}`);
          lista = r?.data ?? [];
          totalActual = r?.total ?? lista.length;
        } catch (e) {
          // Si el backend no expone la vista, se filtra la cola global en el cliente.
          const r = await api.get(`/admin/incidentes?${params}`);
          const todas = r?.data ?? [];
          lista = todas.filter((c) => {
            const mio = yoId != null && String(idAsignado(c) ?? '') === String(yoId);
            return vista === 'mios' ? mio : (c?.siguiendo === true && !mio);
          });
          totalActual = lista.length;
        }
      } else {
        let url = `/admin/incidentes?${params}`;
        if (tab === 'Resueltos') url += '&estado=Resuelto';
        const r = await api.get(url);
        const todas = r?.data ?? [];
        totalActual = r?.total ?? todas.length;
        if (tab === 'Activos') {
          lista = todas.filter((c) => ['Abierto', 'EnGestion'].includes(c?.estado));
          if (lista.length === 0 && todas.length > 0) lista = todas;
        } else if (tab === 'Sin triar') {
          lista = todas.filter((c) => (c?.prioridad ?? null) === null);
          if (lista.length === 0 && todas.length > 0 && prioFiltro !== 'Todas') lista = todas;
        } else {
          lista = todas;
        }
      }

      // Los filtros fines se aplican tambien en el cliente por si el backend no filtra.
      if (tipoFiltro !== 'Todos') lista = lista.filter((c) => c?.tipo === tipoFiltro);
      if (prioFiltro !== 'Todas') lista = lista.filter((c) => c?.prioridad === prioFiltro);

      setItems(lista);
      setTotal(totalActual);
      await cargarResumen(lista, yoId);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar la cola.');
    } finally {
      cargadoUnaVez.current = true;
      setCargando(false);
      setRefreshing(false);
    }
  }, [tab, orden, tipoFiltro, prioFiltro, cargarYo, yo, user]);

  async function cargarResumen(lista, yoId) {
    try {
      const r = await api.get('/admin/incidentes/resumen');
      const d = r?.data ?? r ?? null;
      if (d && !Array.isArray(d)) {
        setConteos({
          sinTriar: d?.sin_triar ?? d?.sinTriar ?? null,
          vencidos: d?.vencidos ?? null,
          mios: d?.mios ?? d?.mis ?? null,
        });
      } else {
        setConteos({
          sinTriar: lista.filter((c) => (c?.prioridad ?? null) === null).length,
          vencidos: lista.filter((c) => infoSla(c)?.vencido).length,
          mios: yoId != null ? lista.filter((c) => String(idAsignado(c) ?? '') === String(yoId)).length : null,
        });
      }
    } catch (e) { /* el resumen es opcional */ }
  }

  useEffect(() => { cargar(pagina); }, [cargar, pagina, refreshKey]);

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
            await cargar(pagina);
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
      await cargar(pagina);
    } catch (e) {
      setError(e?.message ?? 'No se pudo actualizar el seguimiento.');
    } finally {
      setSiguiendoId(null);
    }
  }

  const visibles = useMemo(() => {
    const lista = [...(items ?? [])];
    const porFecha = (a, b) => (new Date(a?.creado_at ?? 0).getTime() || 0) - (new Date(b?.creado_at ?? 0).getTime() || 0);
    if (orden === 'urgencia') {
      lista.sort((a, b) => {
        const va = infoSla(a)?.vencido ? 0 : 1;
        const vb = infoSla(b)?.vencido ? 0 : 1;
        if (va !== vb) return va - vb;
        const pa = ORDEN_PRIORIDAD[a?.prioridad] ?? 9;
        const pb = ORDEN_PRIORIDAD[b?.prioridad] ?? 9;
        if (pa !== pb) return pa - pb;
        return porFecha(a, b);
      });
    } else {
      const signo = orden === 'asc' ? 1 : -1;
      lista.sort((a, b) => {
        const pa = ORDEN_PRIORIDAD[a?.prioridad] ?? 9;
        const pb = ORDEN_PRIORIDAD[b?.prioridad] ?? 9;
        if (pa !== pb) return pa - pb;
        return porFecha(a, b) * signo;
      });
    }
    return lista;
  }, [items, orden]);

  const esUltima = pagina >= totalPaginas;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargar(pagina)} colors={[theme.colors.primary]} />}
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
            onPress={() => irAResumen(c.id)}
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
        {TABS.map((t) => (
          <Pressable
            key={t}
            onPress={() => cambiarTab(t)}
            style={[styles.tab, tab === t && styles.tabActivo]}
            accessibilityRole="tab"
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
            onPress={() => setOrden(s.id)}
            style={[styles.segBtn, orden === s.id && styles.segActive]}
            accessibilityRole="radio"
            accessibilityLabel={`Ordenar por ${s.label}`}
            accessibilityState={{ selected: orden === s.id }}
          >
            <Text style={[styles.segText, orden === s.id && styles.segTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorBanner message={error} />
      {cargando && items === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {items !== null && visibles.length === 0 && !cargando && error === '' && (
        <EmptyState title="Cola vacía" hint="No hay casos en esta sección." />
      )}

      {visibles.map((caso) => (
        <CasoCard
          key={caso?.id}
          caso={caso}
          yo={yo}
          reclamando={reclamando}
          siguiendoId={siguiendoId}
          onOpen={onOpen}
          onReclamar={reclamar}
          onSeguir={seguir}
        />
      ))}

      {items !== null && visibles.length > 0 && (
        <View style={styles.rowBetween}>
          <Pressable
            onPress={() => setPage(Math.max(1, pagina - 1))}
            disabled={pagina <= 1}
            style={styles.linkBtn}
            accessibilityRole="button"
            accessibilityLabel="Ir a página anterior"
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
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
  dim: { opacity: 0.4 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  vencido: { color: theme.colors.critical, fontWeight: 'bold', fontSize: theme.type.caption },
  asignado: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 4 },
  asignadoTexto: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  accionesFila: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' },
  reclamarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: theme.spacing.md },
  reclamarTexto: { color: '#fff', fontWeight: 'bold' },
  reclamarBtnOn: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.primary },
  reclamarTextoOn: { color: theme.colors.primary },
});
