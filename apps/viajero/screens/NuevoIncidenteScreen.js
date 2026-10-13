// Nuevo incidente: tipo + reserva opcional + título/descripción con contador.
// Confirma con Alert antes de enviar (acción no reversible) y muestra n° de reporte al éxito.
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { encolarReporte, sincronizar } from '../../shared/offlineQueue';
import { AppButton, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, fmtFecha } from '../../shared/format';

const TIPOS_FALLBACK = {
  Vuelo_cancelado: 'Vuelo cancelado',
  Vuelo_retrasado: 'Vuelo retrasado',
  Hotel_sin_reserva: 'Hotel sin reserva',
  Equipaje: 'Equipaje perdido o dañado',
  Cobro_indebido: 'Cobro indebido',
  Fraude: 'Fraude o estafa',
  Otro: 'Otro',
};

const ORDEN_TIPOS = ['Vuelo_cancelado', 'Vuelo_retrasado', 'Hotel_sin_reserva', 'Equipaje', 'Cobro_indebido', 'Fraude', 'Otro'];

function labelTipo(t) {
  return TIPO_INCIDENTE?.[t] ?? TIPOS_FALLBACK?.[t] ?? t;
}

const TIPOS = ORDEN_TIPOS;

const AYUDA_TIPO = {
  Vuelo_cancelado: 'Indicá N° de vuelo y aeropuerto',
  Vuelo_retrasado: 'Indicá N° de vuelo y horas de demora',
  Hotel_sin_reserva: 'Indicá hotel, ciudad y fecha de check-in',
  Equipaje: 'Describí valija + N° de reclamo aerolínea si tenés',
  Cobro_indebido: 'Indicá monto, fecha y últimos 4 dígitos (nunca el número completo)',
  Fraude: 'Describí qué pasó sin incluir claves ni CBU completos',
  Otro: 'Contanos con detalle qué pasó',
};

function detalleReserva(r) {
  const ruta = r?.tipo === 'vuelo' ? `${r?.origen || '?'} - ${r?.destino || '?'}` : r?.hotel || 'Hotel';
  return `${r?.codigo ?? '?'} · ${fmtFecha(r?.fecha_inicio)} · ${ruta}`;
}

export function NuevoIncidenteScreen({ onCreated, reservaIdInicial }) {
  const [reservas, setReservas] = useState([]);
  const [reservasError, setReservasError] = useState('');
  const [tipo, setTipo] = useState('Vuelo_cancelado');
  const [reservaId, setReservaId] = useState(reservaIdInicial ?? null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [idemKey] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    api.get('/itinerario')
      .then((r) => setReservas(r?.data ?? []))
      .catch(() => setReservasError('No pudimos cargar tus reservas. Igual podes reportar sin reserva.'));
  }, []);

  useEffect(() => {
    setReservaId(reservaIdInicial ?? null);
  }, [reservaIdInicial]);

  const reservaSel = reservas?.find((r) => r?.id === reservaId) || null;

  function validar() {
    if (titulo.trim().length < 5) return 'El título debe tener al menos 5 caracteres.';
    if (descripcion.trim().length < 10) return 'Describe el problema con al menos 10 caracteres.';
    return '';
  }

  function submit() {
    if (loading) return;
    const v = validar();
    if (v) { setError(v); return; }
    const nombreTipo = labelTipo(tipo);
    const nombreReserva = reservaSel?.codigo ?? 'Sin reserva';
    Alert.alert(
      'Enviar reporte',
      `Tipo: ${nombreTipo}\nReserva: ${nombreReserva}\nTítulo: ${titulo.trim()}\n\nUna vez enviado no podrás editarlo. ¿Confirmas el envío?`,
      [
        { text: 'Revisar', style: 'cancel' },
        { text: 'Enviar', onPress: enviar },
      ]
    );
  }

  async function enviar() {
    if (loading) return;
    setError('');
    setLoading(true);
    const payload = {
      tipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      ...(reservaId ? { reserva_id: reservaId } : {}),
      idempotencia_key: idemKey,
    };
    try {
      // Reintenta cola offline primero (mismo idempotencia_key evita duplicados).
      try {
        await sincronizar(api);
      } catch (e) { /* sigue al envío actual */ }
      const r = await api.post('/incidentes', payload);
      setOk(r.data.id);
    } catch (e) {
      const sinRed = /network|fetch|failed|timeout/i.test(e.message || '');
      if (sinRed) {
        await encolarReporte(payload);
        setError('Sin conexión: guardado en cola, se envía solo al volver la red.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (ok !== null) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Reporte #{ok} creado</Text>
        <Text style={styles.sub}>El equipo de soporte te responderá aquí mismo. Puedes seguirlo en Mis incidentes.</Text>
        <AppButton title="Ver mis incidentes" onPress={() => onCreated(ok)} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Reportar problema</Text>
      {reservaSel && <Text style={styles.aviso}>Reportando sobre {reservaSel.codigo}</Text>}
      <ErrorBanner message={error} />
      <Text style={styles.label}>Tipo de problema</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.opts}>
        {TIPOS?.map((t) => (
          <Pressable key={t} onPress={() => setTipo(t)} style={[styles.opt, tipo === t && styles.optActive]} accessibilityRole="button">
            <Text style={[styles.optText, tipo === t && styles.optTextActive]}>{labelTipo(t)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.ayuda}>{AYUDA_TIPO?.[tipo] || ''}</Text>
      <Text style={styles.label}>Reserva relacionada (opcional)</Text>
      {reservasError !== '' && <Text style={styles.muted}>{reservasError}</Text>}
      <View style={styles.opts}>
        <Pressable onPress={() => setReservaId(null)} style={[styles.opt, reservaId === null && styles.optActive]} accessibilityRole="button">
          <Text style={[styles.optText, reservaId === null && styles.optTextActive]}>Sin reserva</Text>
        </Pressable>
        {reservas?.map((r) => (
          <Pressable key={r?.id} onPress={() => setReservaId(r?.id)} style={[styles.opt, reservaId === r?.id && styles.optActive]} accessibilityRole="button">
            <Text style={[styles.optText, reservaId === r?.id && styles.optTextActive]}>{detalleReserva(r)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Título ({titulo.trim().length}/120)</Text>
      <TextInput style={styles.input} value={titulo} onChangeText={(t) => setTitulo(t.slice(0, 120))} placeholder="Ej. Vuelo cancelado y estoy varada" placeholderTextColor={theme.colors.muted} maxLength={120} autoCorrect={false} autoCapitalize="sentences" returnKeyType="next" />
      <Text style={styles.label}>Descripción ({descripcion.trim().length}/2000, mín. 10)</Text>
      <TextInput style={[styles.input, styles.area]} value={descripcion} onChangeText={(t) => setDescripcion(t.slice(0, 2000))} placeholder="Contanos qué pasó, n° de vuelo o reserva…" placeholderTextColor={theme.colors.muted} multiline numberOfLines={4} textAlignVertical="top" maxLength={2000} autoCorrect={false} returnKeyType="send" onSubmitEditing={submit} />
      <AppButton title="Enviar reporte" onPress={submit} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.body, color: theme.colors.text },
  aviso: { fontSize: theme.type.body, fontWeight: 'bold', color: theme.colors.primary, backgroundColor: '#EBE5F5', borderRadius: theme.radius.md, padding: theme.spacing.sm },
  ayuda: { fontSize: theme.type.caption, color: theme.colors.muted, fontStyle: 'italic' },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold', marginTop: theme.spacing.sm },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  opt: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, minHeight: 44, justifyContent: 'center', backgroundColor: theme.colors.card },
  optActive: { borderColor: theme.colors.primary, backgroundColor: '#EBE5F5' },
  optText: { color: theme.colors.text },
  optTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.card, minHeight: theme.touch, paddingHorizontal: theme.spacing.md, fontSize: theme.type.body, color: theme.colors.text },
  area: { minHeight: 110, paddingVertical: theme.spacing.sm },
});
