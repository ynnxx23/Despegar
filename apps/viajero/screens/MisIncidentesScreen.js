// Mis incidentes + detalle con hilo de respuestas (viajero solo ve lo propio).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, fmtFecha } from '../../shared/format';

const FILTROS = [
  { key: 'Todos', label: 'Todos' },
  { key: 'Abierto', label: 'Abiertos' },
  { key: 'EnGestion', label: 'En gestión' },
  { key: 'Resuelto', label: 'Resueltos' },
];

export function MisIncidentesScreen({ onOpen, refreshKey, onReportar }) {
  const [filtro, setFiltro] = useState('Todos');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/incidentes/mios');
      setData(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const lista = data ?? [];
  const abiertos = lista.filter((i) => i.estado === 'Abierto').length;
  const enGestion = lista.filter((i) => i.estado === 'EnGestion').length;
  const resueltos = lista.filter((i) => i.estado === 'Resuelto').length;
  const conteos = { Todos: lista.length, Abierto: abiertos, EnGestion: enGestion, Resuelto: resueltos };
  const visible = filtro === 'Todos' ? lista : lista.filter((i) => i.estado === filtro);

  return (
    <ScrollView
      style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Mis incidentes</Text>
      <View style={styles.resumen}>
        <Text style={styles.resumenText}>Abiertos {abiertos} · En gestión {enGestion} · Resueltos {resueltos}</Text>
      </View>
      <View style={styles.row}>
        {FILTROS.map((f) => (
          <Pressable key={f.key} onPress={() => setFiltro(f.key)} style={[styles.chip, filtro === f.key && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, filtro === f.key && styles.chipTextActive]}>{f.label} ({conteos[f.key] ?? 0})</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
      {error !== '' && <Text style={styles.retry} onPress={load}>Toca para reintentar</Text>}
      {data === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {data !== null && visible.length === 0 && (
        <EmptyState title="Sin incidentes" hint="Todavía no reportaste problemas. Si algo falla en tu viaje, repórtalo." actionTitle={onReportar ? 'Reportar problema' : undefined} onAction={onReportar ? () => onReportar?.() : undefined} />
      )}
      {visible.map((i) => (
        <Pressable key={i.id} onPress={() => onOpen(i.id)} style={styles.card} accessibilityRole="button">
          <Text style={styles.cardTitle}>#{i.id} · {i.titulo}</Text>
          <Text style={styles.muted}>{TIPO_INCIDENTE[i.tipo] || i.tipo} · {fmtFecha(i.creado_at)}</Text>
          <View style={styles.row}>
            <Badge text={i.estado} color={theme.status[i.estado] || theme.colors.muted} />
          </View>
          {i.ultima_respuesta?.mensaje ? (
            <Text style={styles.preview} numberOfLines={2}>
              {i.ultima_respuesta?.autor ? `${i.ultima_respuesta.autor}: ` : ''}{i.ultima_respuesta.mensaje}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const PASOS = [
  { key: 'Abierto', label: 'Abierto' },
  { key: 'EnGestion', label: 'En gestión' },
  { key: 'Resuelto', label: 'Resuelto' },
];

export function DetalleIncidenteScreen({ id, onBack }) {
  const [inc, setInc] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, b] = await Promise.all([api.get(`/incidentes/${id}`), api.get(`/incidentes/${id}/respuestas`)]);
      setInc(a.data);
      setHilo(b.data);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  const idxActual = Math.max(0, PASOS.findIndex((p) => p.key === inc?.estado));

  return (
    <ScrollView
      style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <AppButton title="Volver" onPress={onBack} variant="ghost" />
      <ErrorBanner message={error} />
      {error !== '' && <Text style={styles.retry} onPress={load}>Toca para reintentar</Text>}
      {!inc && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {inc && (
        <View style={styles.card}>
          <Text selectable style={styles.cardTitle}>Reporte #{inc.id} · {inc.titulo}</Text>
          <View style={styles.row}>
            <Badge text={inc.estado} color={theme.status[inc.estado] || theme.colors.muted} />
          </View>
          <Text style={styles.muted}>{TIPO_INCIDENTE[inc.tipo] || inc.tipo} · {fmtFecha(inc.creado_at)}</Text>
          <Text style={styles.body}>{inc.descripcion}</Text>
          <View style={styles.timeline}>
            {PASOS.map((p, i) => {
              const activo = i === idxActual;
              const hecho = i < idxActual || inc?.estado === 'Resuelto' && i <= idxActual;
              return (
                <View key={p.key} style={styles.paso}>
                  <View style={[styles.punto, hecho && styles.puntoHecho, activo && styles.puntoActivo]}>
                    <Text style={[styles.puntoTexto, (hecho || activo) && styles.puntoTextoActivo]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.pasoTexto, activo && styles.pasoActivo]}>{p.label}</Text>
                  {i === 0 && inc?.creado_at ? <Text style={styles.pasoFecha}>{fmtFecha(inc.creado_at)}</Text> : null}
                  {i > 0 && activo && inc?.actualizado_at ? <Text style={styles.pasoFecha}>{fmtFecha(inc.actualizado_at)}</Text> : null}
                </View>
              );
            })}
          </View>
        </View>
      )}
      {inc && <Text style={styles.subtitle}>Respuestas de soporte ({hilo.length})</Text>}
      {inc && hilo.length === 0 && <Text style={styles.muted}>Aún sin respuestas. Te avisaremos aquí cuando el agente conteste.</Text>}
      {hilo.map((m) => {
        const esAgente = m.autor_rol ? m.autor_rol === 'agente' : false;
        return (
          <View key={m.id} style={[styles.reply, esAgente ? styles.replyAgente : styles.replyViajero]}>
            <Text style={styles.muted}>{m.autor || (esAgente ? 'Soporte' : 'Vos')} · {fmtFecha(m.creado_at)}</Text>
            <Text style={styles.body}>{m.mensaje}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  retry: { color: theme.colors.primary, fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  resumen: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  resumenText: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: theme.colors.card },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  preview: { fontSize: theme.type.caption, color: theme.colors.muted, fontStyle: 'italic' },
  reply: { borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4, maxWidth: '85%' },
  replyAgente: { backgroundColor: '#EDE7FB', alignSelf: 'flex-end' },
  replyViajero: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' },
  timeline: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  paso: { flex: 1, alignItems: 'center', gap: 4 },
  punto: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' },
  puntoHecho: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  puntoActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  puntoTexto: { color: theme.colors.muted, fontWeight: 'bold' },
  puntoTextoActivo: { color: '#fff' },
  pasoTexto: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
  pasoActivo: { color: theme.colors.text, fontWeight: 'bold' },
  pasoFecha: { fontSize: 12, color: theme.colors.muted, textAlign: 'center' },
});
