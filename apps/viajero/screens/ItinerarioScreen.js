// Itinerario del viajero: GET /api/itinerario con carga / vacío / error + reintentar.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, EmptyState, ErrorBanner, Badge } from '../../shared/components';
import { TIPO_RESERVA, fmtFecha } from '../../shared/format';

function inicioDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function textoCuenta(reserva) {
  if (!reserva?.fecha_inicio) return '';
  const hoy = inicioDia(new Date());
  const ini = inicioDia(reserva.fecha_inicio);
  const fin = reserva?.fecha_fin ? inicioDia(reserva.fecha_fin) : null;
  if (fin && hoy >= ini && hoy <= fin) return 'en curso';
  const dias = Math.round((ini - hoy) / 86400000);
  if (dias > 0) return `en ${dias} días`;
  if (dias === 0) return 'es hoy';
  return `hace ${Math.abs(dias)} días`;
}

function rutaReserva(r) {
  return r?.tipo === 'vuelo' ? `${r?.origen || '?'} → ${r?.destino || '?'}` : r?.hotel || 'Hotel';
}

export function ItinerarioScreen({ onReportar }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api.get('/itinerario');
      setData(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const lista = data ?? [];
  const vuelos = lista.filter((r) => r?.tipo === 'vuelo').length;
  const hoteles = lista.filter((r) => r?.tipo === 'hotel').length;
  const hoy = inicioDia(new Date());
  const futuras = lista
    .filter((r) => r?.fecha_inicio && inicioDia(r.fecha_inicio) >= hoy)
    .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
  const proximo = futuras.length > 0 ? futuras[0] : null;
  const proximos = lista
    .filter((r) => r?.fecha_inicio && inicioDia(r.fecha_inicio) >= hoy)
    .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
  const pasados = lista
    .filter((r) => !r?.fecha_inicio || inicioDia(r.fecha_inicio) < hoy)
    .sort((a, b) => new Date(b?.fecha_inicio || 0) - new Date(a?.fecha_inicio || 0));

  function tarjeta(r, destacada) {
    return (
      <View style={destacada ? styles.destacada : styles.card}>
        {destacada && <Text style={styles.sello}>PRÓXIMO VIAJE · {textoCuenta(r)}</Text>}
        <Text style={destacada ? styles.codigoGrande : styles.cardTitle}>{TIPO_RESERVA?.[r?.tipo] ?? r?.tipo} · {r?.codigo}</Text>
        <Text style={styles.body}>{rutaReserva(r)}</Text>
        <Text style={styles.muted}>{fmtFecha(r?.fecha_inicio)}{r?.fecha_fin ? ` — ${fmtFecha(r?.fecha_fin)}` : ''}{!destacada ? ` · ${textoCuenta(r)}` : ''}</Text>
        <Badge text={r?.estado} color={theme.status?.[r?.estado] || theme.colors.muted} />
        <AppButton title="Reportar sobre esta reserva" onPress={() => onReportar?.(r?.id)} variant="ghost" />
      </View>
    );
  }

  const restoProximos = proximos.filter((r) => !proximo || r?.id !== proximo?.id);
  const filas = [...restoProximos, ...pasados];
  const cargando = data === null && error === '';

  function header() {
    return (
      <View style={styles.headerCol}>
        <Text style={styles.title}>Mi itinerario</Text>
        <ErrorBanner message={error} />
        {error !== '' && <Text style={styles.retry} onPress={load}>Toca para reintentar</Text>}
        {cargando && <ActivityIndicator color={theme.colors.primary} />}
        {data !== null && data.length > 0 && (
          <Text style={styles.muted}>{vuelos} vuelos · {hoteles} hoteles</Text>
        )}
        {proximo && tarjeta(proximo, true)}
        {data !== null && data.length > 0 && (
          <Text style={styles.seccion}>Próximos ({proximos.length}) · Pasados ({pasados.length})</Text>
        )}
      </View>
    );
  }

  function vacio() {
    if (cargando || error !== '') return null;
    if (data !== null && data.length === 0) {
      if (onReportar) {
        return <EmptyState title="Aún no tienes viajes" hint="Cuando compres un viaje aparecerá aquí tu itinerario." actionTitle="Reportar problema" onAction={() => onReportar?.(null)} />;
      }
      return <EmptyState title="Aún no tienes viajes" hint="Cuando compres un viaje aparecerá aquí tu itinerario." />;
    }
    return null;
  }

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={filas}
      keyExtractor={(r) => String(r?.id)}
      renderItem={({ item }) => tarjeta(item, false)}
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
  seccion: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text, marginTop: theme.spacing.sm },
  retry: { color: theme.colors.primary, fontWeight: 'bold' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 4 },
  destacada: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6, borderWidth: 2, borderColor: theme.colors.primary },
  sello: { fontSize: theme.type.caption, fontWeight: 'bold', color: theme.colors.primary },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  codigoGrande: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
});
