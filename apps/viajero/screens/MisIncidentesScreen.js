// Lista de incidentes del viajero (solo los propios) con filtros por estado.
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { Badge, EmptyState, ErrorBanner, LoadingRow } from '../../shared/components';
import { etiquetaTipo, fmtFecha } from '../../shared/format';

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
        <Text style={styles.title}>Mis incidentes</Text>
        <Text style={styles.resumenText}>
          Abiertos {conteos.Abierto} · En gestión {conteos.EnGestion} · Resueltos {conteos.Resuelto}
        </Text>
        <View style={styles.row}>
          {FILTROS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFiltro(f.key)}
              style={[styles.chip, filtro === f.key && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Filtrar por ${f.label}`}
              accessibilityState={{ selected: filtro === f.key }}
            >
              <Text style={[styles.chipText, filtro === f.key && styles.chipTextActive]}>
                {f.label} ({conteos[f.key] ?? 0})
              </Text>
            </Pressable>
          ))}
        </View>
        <ErrorBanner message={error} />
        {error !== '' && <Text style={styles.retry} onPress={load}>Toca para reintentar</Text>}
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
    return (
      <Pressable
        onPress={() => onOpen(incidente?.id)}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`Abrir incidente ${incidente?.id}`}
      >
        <Text style={styles.cardTitle}>#{incidente?.id} · {incidente?.titulo}</Text>
        <Text style={styles.muted}>{etiquetaTipo(incidente?.tipo)} · {fmtFecha(incidente?.creado_at)}</Text>
        {atiende ? <Text style={styles.atiende}>Atiende: {atiende}</Text> : null}
        <Badge text={incidente?.estado} color={theme.status?.[incidente?.estado] || theme.colors.muted} />
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
      keyExtractor={(i) => String(i?.id)}
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
  retry: { color: theme.colors.primary, fontWeight: 'bold' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  resumenText: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 40, justifyContent: 'center', backgroundColor: theme.colors.card },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  preview: { fontSize: theme.type.caption, color: theme.colors.muted, fontStyle: 'italic' },
  atiende: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.primary },
});
