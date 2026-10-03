// Gestión del incidente: ver, cambiar prioridad/estado (Resuelto con confirmación) y responder.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, fmtFecha } from '../../shared/format';

export function DetalleGestionScreen({ id, onBack }) {
  const [inc, setInc] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [a, b] = await Promise.all([api.get(`/admin/incidentes/${id}`), api.get(`/admin/incidentes/${id}/respuestas`)]);
      setInc(a.data);
      setHilo(b.data);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function put(parche) {
    setError('');
    setSaving(true);
    try {
      const r = await api.put(`/admin/incidentes/${id}`, parche);
      setInc(r.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function cerrar() {
    Alert.alert('Marcar resuelto', 'Confirma que ya hablaste con la aerolínea/hotel y el viajero fue atendido.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Resuelto', onPress: () => put({ estado: 'Resuelto' }) },
    ]);
  }

  async function responder() {
    setError('');
    if (mensaje.trim().length < 2) { setError('Escribe una respuesta de al menos 2 caracteres.'); return; }
    setSaving(true);
    try {
      await api.post(`/admin/incidentes/${id}/respuestas`, { mensaje: mensaje.trim() });
      setMensaje('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
        <>
          <Text style={styles.label}>Prioridad</Text>
          <View style={styles.row}>
            {['Baja', 'Alta', 'Critica'].map((p) => (
              <Pressable key={p} onPress={() => put({ prioridad: p })} disabled={saving || inc.prioridad === p} style={[styles.chip, inc.prioridad === p && styles.chipActive]} accessibilityRole="button">
                <Text style={[styles.chipText, inc.prioridad === p && styles.chipTextActive]}>{p === 'Critica' ? 'Crítica' : p}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Estado</Text>
          <View style={styles.row}>
            {['Abierto', 'EnGestion', 'Resuelto'].map((s) => (
              <Pressable
                key={s}
                onPress={() => (s === 'Resuelto' ? cerrar() : put({ estado: s }))}
                disabled={saving || inc.estado === s}
                style={[styles.chip, inc.estado === s && styles.chipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, inc.estado === s && styles.chipTextActive]}>{s === 'EnGestion' ? 'En gestión' : s}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Responder al viajero</Text>
          <TextInput
            style={styles.area} value={mensaje} onChangeText={(t) => setMensaje(t.slice(0, 2000))}
            placeholder="Ej. Hablamos con la aerolínea: reprogramado mañana 08:00." placeholderTextColor={theme.colors.muted}
            multiline numberOfLines={3} textAlignVertical="top"
          />
          <AppButton title="Enviar respuesta" onPress={responder} loading={saving} />
          <Text style={styles.subtitle}>Hilo ({hilo.length})</Text>
          {hilo.map((m) => (
            <View key={m.id} style={styles.reply}>
              <Text style={styles.muted}>{m.autor} · {fmtFecha(m.creado_at)}</Text>
              <Text style={styles.body}>{m.mensaje}</Text>
            </View>
          ))}
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: theme.spacing.md, minHeight: 44, justifyContent: 'center', backgroundColor: theme.colors.card, opacity: 1 },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EDE7FB' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  area: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.card, minHeight: 90, padding: theme.spacing.sm, fontSize: theme.type.body, color: theme.colors.text },
  reply: { backgroundColor: '#EDE7FB', borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4 },
});
