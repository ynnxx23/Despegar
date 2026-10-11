// Detalle del incidente del viajero: estado, novedades y respuestas de soporte.
// El hilo de respuestas va en FlatList (no se renderiza todo de una vez).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, ErrorBanner } from '../../shared/components';
import { etiquetaEstado, etiquetaTipo, fmtFecha } from '../../shared/format';

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

  // Índice real del estado: -1 si el backend devuelve un estado desconocido.
  const indiceEstado = PASOS.findIndex((p) => p.key === inc?.estado);
  const estadoDesconocido = indiceEstado < 0;
  const atiende = inc?.atendido_por ?? null;
  const novedades = inc?.historial ?? [];

  function paso(i) {
    const p = PASOS[i];
    const activo = i === indiceEstado;
    const hecho = !estadoDesconocido && (i < indiceEstado || (inc?.estado === 'Resuelto' && i <= indiceEstado));
    return (
      <View
        key={p.key}
        style={styles.paso}
        accessible
        accessibilityRole="text"
        accessibilityState={{ selected: activo }}
        accessibilityLabel={`${p.label}: ${hecho ? 'completado' : activo ? 'en curso' : 'pendiente'}`}
      >
        <View style={[styles.punto, hecho && styles.puntoHecho, activo && styles.puntoActivo]}>
          <Text style={[styles.puntoTexto, (hecho || activo) && styles.puntoTextoActivo]}>{hecho ? '✓' : i + 1}</Text>
        </View>
        <Text style={[styles.pasoTexto, activo && styles.pasoActivo]}>{p.label}</Text>
        {/* El estado del paso se dice con texto: el color solo no alcanza. */}
        <Text style={styles.pasoEstado}>{hecho ? 'Completado' : activo ? 'En curso' : 'Pendiente'}</Text>
        {i === 0 && inc?.creado_at ? <Text style={styles.pasoFecha}>{fmtFecha(inc.creado_at)}</Text> : null}
        {i > 0 && activo && inc?.actualizado_at ? <Text style={styles.pasoFecha}>{fmtFecha(inc.actualizado_at)}</Text> : null}
      </View>
    );
  }

  function header() {
    return (
      <View style={styles.headerCol}>
        <AppButton title="Volver" onPress={onBack} variant="ghost" accessibilityLabel="Volver a mis incidentes" />
        <ErrorBanner message={error} onRetry={load} />
        {!inc && error === '' && (
          <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Cargando el incidente" />
        )}

        {inc && (
          <View style={styles.card}>
            <Text selectable style={styles.cardTitle} accessibilityRole="header">Reporte #{inc?.id} · {inc?.titulo}</Text>
            <Badge
              text={etiquetaEstado(inc?.estado)}
              color={theme.status?.[inc?.estado] || theme.colors.muted}
              label="Estado"
            />
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
              {PASOS.map((_, i) => paso(i))}
            </View>
            {estadoDesconocido ? (
              <Text style={styles.muted}>
                Estado actual desconocido ({inc?.estado ?? '—'}): el seguimiento puede estar desactualizado.
              </Text>
            ) : null}
          </View>
        )}

        {inc && (
          <View style={styles.card}>
            <Text style={styles.subtitle} accessibilityRole="header">Novedades ({novedades.length})</Text>
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

        {inc && <Text style={styles.subtitle} accessibilityRole="header">Respuestas de soporte ({hilo.length})</Text>}
      </View>
    );
  }

  function sinRespuestas() {
    if (!inc || error !== '') return null;
    return (
      <Text style={styles.muted}>
        Aún sin respuestas. Te avisaremos aquí cuando el agente conteste.
      </Text>
    );
  }

  function respuesta({ item: m }) {
    const delAgente = m?.autor_rol === 'agente';
    const autor = m?.autor || (delAgente ? 'Soporte' : 'Vos');
    return (
      <View
        style={[styles.reply, delAgente ? styles.replyAgente : styles.replyViajero]}
        accessible
        accessibilityLabel={`${autor}, ${fmtFecha(m?.creado_at)}: ${m?.mensaje ?? ''}`}
      >
        <Text style={styles.muted}>{autor} · {fmtFecha(m?.creado_at)}</Text>
        <Text style={styles.body}>{m?.mensaje}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={hilo}
      keyExtractor={(m, idx) => String(m?.id ?? idx)}
      renderItem={respuesta}
      ListHeaderComponent={header()}
      ListEmptyComponent={sinRespuestas()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  headerCol: { gap: theme.spacing.md },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
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
  pasoEstado: { fontSize: 12, color: theme.colors.text, textAlign: 'center' },
  pasoFecha: { fontSize: 12, color: theme.colors.muted, textAlign: 'center' },
  caso: { backgroundColor: theme.colors.background, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 2, borderWidth: 1, borderColor: theme.colors.border },
  casoTitulo: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.muted },
  casoNombre: { fontSize: theme.type.body, fontWeight: 'bold', color: theme.colors.text },
  novedad: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  novedadPunto: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary, marginTop: 5 },
  novedadCol: { flex: 1, gap: 2 },
});
