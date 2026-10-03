// Mis incidentes + detalle con hilo de respuestas (viajero solo ve lo propio).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, fmtFecha } from '../../shared/format';

const FILTROS = ['Todos', 'Abierto', 'EnGestion', 'Resuelto'];

export function MisIncidentesScreen({ onOpen, refreshKey }) {
  const [filtro, setFiltro] = useState('Todos');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const q = filtro === 'Todos' ? '/incidentes/mios' : `/incidentes/mios?estado=${filtro}`;
      const r = await api.get(q);
      setData(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, [filtro]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  return (
    <ScrollView
      style={styles.root} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Mis incidentes</Text>
      <View style={styles.row}>
        {FILTROS.map((f) => (
          <Pressable key={f} onPress={() => setFiltro(f)} style={[styles.chip, filtro === f && styles.chipActive]} accessibilityRole="button">
            <Text style={[styles.chipText, filtro === f && styles.chipTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
      {data === null && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {data !== null && data.length === 0 && (
        <EmptyState title="Sin incidentes" hint="Todavía no reportaste problemas. Si algo falla en tu viaje, repórtalo." />
      )}
      {data !== null && data.map((i) => (
        <Pressable key={i.id} onPress={() => onOpen(i.id)} style={styles.card} accessibilityRole="button">
          <Text style={styles.cardTitle}>#{i.id} · {i.titulo}</Text>
          <Text style={styles.muted}>{TIPO_INCIDENTE[i.tipo] || i.tipo} · {fmtFecha(i.creado_at)}</Text>
          <View style={styles.row}>
            <Badge text={i.estado} color={theme.status[i.estado] || theme.colors.muted} />
            <Badge text={`Prioridad ${i.prioridad}`} color={theme.priority[i.prioridad] || theme.colors.muted} />
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function DetalleIncidenteScreen({ id, onBack }) {
  const [inc, setInc] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([api.get(`/incidentes/${id}`), api.get(`/incidentes/${id}/respuestas`)]);
        setInc(a.data);
        setHilo(b.data);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [id]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <AppButton title="Volver" onPress={onBack} variant="ghost" />
      <ErrorBanner message={error} />
      {!inc && error === '' && <ActivityIndicator color={theme.colors.primary} />}
      {inc && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>#{inc.id} · {inc.titulo}</Text>
          <View style={styles.row}>
            <Badge text={inc.estado} color={theme.status[inc.estado] || theme.colors.muted} />
            <Badge text={`Prioridad ${inc.prioridad}`} color={theme.priority[inc.prioridad] || theme.colors.muted} />
          </View>
          <Text style={styles.muted}>{TIPO_INCIDENTE[inc.tipo] || inc.tipo} · {fmtFecha(inc.creado_at)}</Text>
          <Text style={styles.body}>{inc.descripcion}</Text>
        </View>
      )}
      {inc && <Text style={styles.subtitle}>Respuestas de soporte ({hilo.length})</Text>}
      {inc && hilo.length === 0 && <Text style={styles.muted}>Aún sin respuestas. Te avisaremos aquí cuando el agente conteste.</Text>}
      {hilo.map((m) => (
        <View key={m.id} style={styles.reply}>
          <Text style={styles.muted}>{m.autor} · {fmtFecha(m.creado_at)}</Text>
          <Text style={styles.body}>{m.mensaje}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: theme.colors.card },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  reply: { backgroundColor: '#EDE7FB', borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4 },
});
