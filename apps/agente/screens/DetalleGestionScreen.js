// Gestión del incidente: ver, cambiar prioridad/estado (Resuelto con confirmación) y responder.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, TIPO_RESERVA, fmtFecha } from '../../shared/format';

export function DetalleGestionScreen({ id, onBack }) {
  const insets = useSafeAreaInsets();
  const [inc, setInc] = useState(null);
  const [viajero, setViajero] = useState(null);
  const [reserva, setReserva] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [savingPut, setSavingPut] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [estadoPendiente, setEstadoPendiente] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, b] = await Promise.all([api.get(`/admin/incidentes/${id}`), api.get(`/admin/incidentes/${id}/respuestas`)]);
      const payload = a.data ?? {};
      setInc(payload.incidente ?? payload);
      setViajero(payload.usuario ?? null);
      setReserva(payload.reserva ?? null);
      setHilo(b.data ?? []);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function put(parche) {
    setError('');
    setSavingPut(true);
    try {
      const r = await api.put(`/admin/incidentes/${id}`, parche);
      const payload = r.data ?? {};
      setInc(payload.incidente ?? payload);
      if (payload.usuario !== undefined) setViajero(payload.usuario);
      if (payload.reserva !== undefined) setReserva(payload.reserva);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingPut(false);
    }
  }

  function cerrar() {
    Alert.alert('Marcar resuelto', 'Confirma que ya hablaste con la aerolínea/hotel y el viajero fue atendido.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Resuelto', onPress: () => put({ estado: 'Resuelto' }) },
    ]);
  }

  function pedirCambioEstado(s) {
    if (!inc || savingPut) return;
    if (s === inc.estado) return;
    if (s === 'Resuelto') { cerrar(); return; }
    if (inc.estado === 'Resuelto') {
      setEstadoPendiente(s);
      return;
    }
    put({ estado: s });
  }

  function confirmarReapertura() {
    if (motivoReapertura.trim().length < 3) {
      setError('Contanos el motivo de la reapertura (mínimo 3 caracteres).');
      return;
    }
    Alert.alert(
      'Reabrir caso',
      `El caso pasa a ${estadoPendiente === 'EnGestion' ? 'En gestión' : estadoPendiente}. Avisale al viajero.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            // TODO: enviar motivoReapertura al backend cuando persista motivo (hoy el PUT va igual sin motivo).
            await put({ estado: estadoPendiente });
            setEstadoPendiente(null);
            setMotivoReapertura('');
          },
        },
      ]
    );
  }

  async function responder() {
    setError('');
    if (mensaje.trim().length < 2) { setError('Escribe una respuesta de al menos 2 caracteres.'); return; }
    setSavingReply(true);
    try {
      await api.post(`/admin/incidentes/${id}/respuestas`, { mensaje: mensaje.trim() });
      setMensaje('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingReply(false);
    }
  }

  const nombreViajero = viajero?.nombre ?? '—';

  function esDeAgente(m) {
    if (m?.autor_rol) return m.autor_rol === 'agente';
    if (nombreViajero !== '—') return m?.autor !== nombreViajero;
    return false;
  }

  const reservaLinea = reserva
    ? `${TIPO_RESERVA[reserva.tipo] || reserva.tipo || 'Reserva'} · ${reserva.codigo ?? reserva.id ?? '—'}`
    : null;
  const reservaRuta = reserva
    ? (reserva.hotel ?? [reserva.origen, reserva.destino].filter(Boolean).join(' → ') ?? '')
    : '';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
    >
      <AppButton title="Volver a la cola" onPress={onBack} variant="ghost" />
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
      {inc && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Viajero</Text>
          <Text style={styles.body}>{viajero?.nombre ?? '—'}</Text>
          <Text style={styles.muted}>{viajero?.email ?? '—'}</Text>
          <Text style={[styles.subtitle, styles.mt]}>Reserva</Text>
          {reserva ? (
            <>
              <Text style={styles.body}>{reservaLinea}</Text>
              {!!reservaRuta && <Text style={styles.muted}>{reservaRuta}</Text>}
            </>
          ) : (
            <Text style={styles.muted}>Sin reserva vinculada</Text>
          )}
        </View>
      )}
      {inc && (
        <>
          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.row}>
            {['Baja', 'Alta', 'Critica'].map((p) => (
              <Pressable key={p} onPress={() => put({ prioridad: p })} disabled={savingPut || inc.prioridad === p} style={[styles.chip, inc.prioridad === p && styles.chipActive]} accessibilityRole="button">
                <Text style={[styles.chipText, inc.prioridad === p && styles.chipTextActive]}>{p === 'Critica' ? 'Crítica' : p}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Estado</Text>
          <View style={styles.row}>
            {['Abierto', 'EnGestion', 'Resuelto'].map((s) => (
              <Pressable
                key={s}
                onPress={() => pedirCambioEstado(s)}
                disabled={savingPut || inc.estado === s}
                style={[styles.chip, inc.estado === s && styles.chipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, inc.estado === s && styles.chipTextActive]}>{s === 'EnGestion' ? 'En gestión' : s}</Text>
              </Pressable>
            ))}
          </View>
          {estadoPendiente !== null && (
            <View style={styles.reopenBox}>
              <Text style={styles.body}>Reabrir como {estadoPendiente === 'EnGestion' ? 'En gestión' : estadoPendiente}. Escribí el motivo antes de confirmar.</Text>
              <TextInput
                style={styles.area}
                value={motivoReapertura}
                onChangeText={(t) => setMotivoReapertura(t.slice(0, 500))}
                placeholder="Ej. El viajero avisó que el problema sigue."
                placeholderTextColor={theme.colors.muted}
                multiline
                textAlignVertical="top"
              />
              <View style={styles.row}>
                <Pressable onPress={() => { setEstadoPendiente(null); setMotivoReapertura(''); }} accessibilityRole="button" style={styles.linkBtn}>
                  <Text style={styles.link}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={confirmarReapertura} accessibilityRole="button" style={styles.linkBtn}>
                  <Text style={styles.link}>Confirmar reapertura</Text>
                </Pressable>
              </View>
            </View>
          )}
          <Text style={styles.label}>Responder al viajero</Text>
          <TextInput
            style={styles.area} value={mensaje} onChangeText={(t) => setMensaje(t.slice(0, 2000))}
            placeholder="Ej. Hablamos con la aerolínea: reprogramado mañana 08:00." placeholderTextColor={theme.colors.muted}
            multiline numberOfLines={3} textAlignVertical="top"
          />
          <AppButton title="Enviar respuesta" onPress={responder} loading={savingReply} />
          <Text style={styles.subtitle}>Hilo ({hilo.length})</Text>
          {hilo.map((m) => {
            const agente = esDeAgente(m);
            return (
              <View key={m.id} style={[styles.threadRow, agente ? styles.rowRight : styles.rowLeft]}>
                <View style={[styles.bubble, agente ? styles.bubbleAgente : styles.bubbleViajero]}>
                  <Text style={styles.muted}>{m.autor ?? '—'} · {agente ? 'Agente' : 'Viajero'} · {fmtFecha(m.creado_at)}</Text>
                  <Text style={styles.body}>{m.mensaje}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  mt: { marginTop: theme.spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 44, justifyContent: 'center', backgroundColor: theme.colors.card, opacity: 1 },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  area: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.card, minHeight: 90, padding: theme.spacing.sm, fontSize: theme.type.body, color: theme.colors.text },
  threadRow: { flexDirection: 'row' },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4 },
  bubbleAgente: { backgroundColor: '#EDE7FB', alignSelf: 'flex-end' },
  bubbleViajero: { backgroundColor: '#EDEFF3', alignSelf: 'flex-start' },
  reopenBox: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
});
