// Lista de incidentes del viajero (solo los propios) con filtros por estado.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { Badge, Chip, EmptyState, ErrorBanner, LoadingRow } from '../../shared/components';
import { etiquetaEstado, etiquetaPrioridad, etiquetaTipo, fmtFecha } from '../../shared/format';

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
      setError(e?.message ?? 'No se pudieron cargar tus incidentes.');
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const lista = data ?? [];
  const conteos = {
    Todos: lista.length,
    Abierto: lista.filter((i) => i?.estado === 'Abierto').length,
    EnGestion: lista.filter((i) => i?.estado === 'EnGestion').length,
    Resuelto: lista.filter((i) => i?.estado === 'Resuelto').length,
  };
  const visibles = filtro === 'Todos' ? lista : lista.filter((i) => i?.estado === filtro);
  const cargando = data === null && error === '';

  function header() {
    return (
      <View style={styles.headerCol}>
        <Text style={styles.title} accessibilityRole="header">Mis incidentes</Text>
        <Text style={styles.resumenText}>
          Abiertos {conteos.Abierto} · En gestión {conteos.EnGestion} · Resueltos {conteos.Resuelto}
        </Text>
        <View style={styles.row}>
          {FILTROS.map((f) => (
            <Chip
              key={f.key}
              label={`${f.label} (${conteos[f.key] ?? 0})`}
              active={filtro === f.key}
              onPress={() => setFiltro(f.key)}
              accessibilityLabel={`Filtrar por ${f.label}`}
            />
          ))}
        </View>
        <ErrorBanner message={error} onRetry={load} />
      </View>
    );
  }

  function vacio() {
    if (cargando) return <LoadingRow text="Cargando incidentes…" />;
    if (error !== '') return null;
    if (data === null || visibles.length > 0) return null;
    return (
      <EmptyState
        title="Sin incidentes"
        hint="Todavía no reportaste problemas. Si algo falla en tu viaje, repórtalo."
        actionTitle={onReportar ? 'Reportar problema' : undefined}
        onAction={onReportar ? () => onReportar?.() : undefined}
      />
    );
  }

  function fila({ item: incidente }) {
    const atiende = incidente?.atendido_por ?? null;
    const ultima = incidente?.ultima_respuesta?.mensaje;
    const estado = incidente?.estado;
    // El backend no expone la prioridad real del caso: solo la sugerida.
    const sugerida = incidente?.prioridad_sugerida ?? null;
    return (
      <Pressable
        onPress={() => onOpen(incidente?.id)}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`Abrir incidente ${incidente?.id}: ${incidente?.titulo ?? 'sin título'}`}
        accessibilityHint="Muestra el detalle y las respuestas de soporte"
      >
        <Text style={styles.cardTitle}>#{incidente?.id} · {incidente?.titulo}</Text>
        <Text style={styles.muted}>{etiquetaTipo(incidente?.tipo)} · {fmtFecha(incidente?.creado_at)}</Text>
        <View style={styles.badges}>
          <Badge
            text={etiquetaEstado(estado)}
            color={theme.status?.[estado] || theme.colors.muted}
            label="Estado"
          />
          {sugerida ? (
            <Badge
              text={etiquetaPrioridad(sugerida)}
              color={theme.priority?.[sugerida] || theme.colors.muted}
              label="Prioridad estimada"
            />
          ) : null}
        </View>
        {atiende ? <Text style={styles.atiende}>Atiende: {atiende}</Text> : null}
        {ultima ? (
          <Text style={styles.preview} numberOfLines={2}>
            {incidente?.ultima_respuesta?.autor ? `${incidente.ultima_respuesta.autor}: ` : ''}{ultima}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={visibles}
      keyExtractor={(i, idx) => String(i?.id ?? idx)}
      renderItem={fila}
      ListHeaderComponent={header()}
      ListEmptyComponent={vacio()}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  headerCol: { gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  resumenText: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  preview: { fontSize: theme.type.caption, color: theme.colors.muted, fontStyle: 'italic' },
  atiende: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.primary },
});
