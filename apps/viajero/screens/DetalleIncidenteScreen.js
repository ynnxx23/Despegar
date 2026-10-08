// Detalle del incidente del viajero: estado, novedades y respuestas de soporte.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, ErrorBanner } from '../../shared/components';
import { etiquetaTipo, fmtFecha } from '../../shared/format';

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
      const [detalle, respuestas] = await Promise.all([
        api.get(`/incidentes/${id}`),
        api.get(`/incidentes/${id}/respuestas`),
      ]);
      setInc(detalle?.data ?? null);
      setHilo(respuestas?.data ?? []);
    } catch (e) {
      setError(e?.message ?? 'No pudimos cargar el detalle.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const pasoActual = Math.max(0, PASOS.findIndex((p) => p.key === inc?.estado));
  const atiende = inc?.atendido_por ?? null;
  const novedades = inc?.historial ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <AppButton title="Volver" onPress={onBack} variant="ghost" />
      <ErrorBanner message={error} />
      {error !== '' && <Text style={styles.retry} onPress={load}>Toca para reintentar</Text>}
      {!inc && error === '' && <ActivityIndicator color={theme.colors.primary} />}

      {inc && (
        <View style={styles.card}>
          <Text selectable style={styles.cardTitle}>Reporte #{inc?.id} · {inc?.titulo}</Text>
          <Badge text={inc?.estado} color={theme.status?.[inc?.estado] || theme.colors.muted} />
          <Text style={styles.muted}>{etiquetaTipo(inc?.tipo)} · {fmtFecha(inc?.creado_at)}</Text>
          <Text style={styles.body}>{inc?.descripcion}</Text>

          <View style={styles.caso}>
            <Text style={styles.casoTitulo}>Tu caso</Text>
            {atiende ? (
              <>
                <Text style={styles.casoNombre}>Lo atiende {atiende}</Text>
                <Text style={styles.muted}>Te avisaremos cada novedad</Text>
              </>
            ) : (
              <Text style={styles.muted}>En revisión por el equipo</Text>
            )}
          </View>

          <View style={styles.timeline}>
            {PASOS.map((p, i) => {
              const activo = i === pasoActual;
              const hecho = i < pasoActual || (inc?.estado === 'Resuelto' && i <= pasoActual);
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

      {inc && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Novedades ({novedades.length})</Text>
          {novedades.length === 0 ? (
            <Text style={styles.muted}>Sin novedades aún</Text>
          ) : (
            novedades.map((h, idx) => (
              <View key={`${h?.creado_at ?? idx}-${idx}`} style={styles.novedad}>
                <View style={styles.novedadPunto} />
                <View style={styles.novedadCol}>
                  <Text style={styles.body}>{h?.texto ?? '—'}</Text>
                  <Text style={styles.muted}>{fmtFecha(h?.creado_at)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {inc && <Text style={styles.subtitle}>Respuestas de soporte ({hilo.length})</Text>}
      {inc && hilo.length === 0 && (
        <Text style={styles.muted}>Aún sin respuestas. Te avisaremos aquí cuando el agente conteste.</Text>
      )}
      {hilo.map((m) => {
        const delAgente = m?.autor_rol === 'agente';
        return (
          <View key={m?.id} style={[styles.reply, delAgente ? styles.replyAgente : styles.replyViajero]}>
            <Text style={styles.muted}>{m?.autor || (delAgente ? 'Soporte' : 'Vos')} · {fmtFecha(m?.creado_at)}</Text>
            <Text style={styles.body}>{m?.mensaje}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  retry: { color: theme.colors.primary, fontWeight: 'bold' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
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
  caso: { backgroundColor: theme.colors.background, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 2, borderWidth: 1, borderColor: theme.colors.border },
  casoTitulo: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.muted },
  casoNombre: { fontSize: theme.type.body, fontWeight: 'bold', color: theme.colors.text },
  novedad: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  novedadPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary, marginTop: 5 },
  novedadCol: { flex: 1, gap: 2 },
});
