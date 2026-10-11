// Nuevo incidente: tipo + reserva opcional + título/descripción con contador.
// Confirma con Alert antes de enviar (acción no reversible) y muestra n° de reporte al éxito.
// El tipo se valida contra la lista compartida TIPO_INCIDENTE (misma que usa el backend).
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, Chip, ErrorBanner, FormScrollView } from '../../shared/components';
import { TIPO_INCIDENTE, etiquetaTipo, fmtFecha } from '../../shared/format';

// Lista única: la del módulo compartido (no se duplica acá).
const TIPOS = Object.keys(TIPO_INCIDENTE);
const TIPO_POR_DEFECTO = TIPOS[0] ?? 'Otro';
const TITULO_MAX = 120;
const DESCRIPCION_MAX = 2000;

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

export function NuevoIncidenteScreen({ onCreated, onEnviado, reservaIdInicial, resetKey = 0 }) {
  const [reservas, setReservas] = useState([]);
  const [reservasError, setReservasError] = useState('');
  const [tipo, setTipo] = useState(TIPO_POR_DEFECTO);
  const [reservaId, setReservaId] = useState(reservaIdInicial ?? null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [intento, setIntento] = useState(false);
  const [ok, setOk] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/itinerario')
      .then((r) => setReservas(r?.data ?? []))
      .catch(() => setReservasError('No pudimos cargar tus reservas. Igual podes reportar sin reserva.'));
  }, []);

  // La reserva preseleccionada (desde el itinerario) se respeta.
  useEffect(() => {
    setReservaId(reservaIdInicial ?? null);
  }, [reservaIdInicial]);

  // El formulario se reinicia SOLO después de un envío exitoso (lo pide la app).
  useEffect(() => {
    if (resetKey === 0) return;
    setTitulo('');
    setDescripcion('');
    setError('');
    setErrores({});
    setIntento(false);
    setTipo(TIPO_POR_DEFECTO);
    setOk(null);
  }, [resetKey]);

  const reservaSel = reservas?.find((r) => r?.id === reservaId) || null;

  // Errores por campo: se muestran recién cuando el usuario intentó enviar.
  function validar() {
    const errs = {};
    if (!TIPOS.includes(tipo)) errs.tipo = 'Elegí un tipo de problema de la lista.';
    if (titulo.trim().length < 5) {
      errs.titulo = 'El título debe tener al menos 5 caracteres.';
    } else if (titulo.trim().length > TITULO_MAX) {
      errs.titulo = `El título no puede superar los ${TITULO_MAX} caracteres.`;
    }
    if (descripcion.trim().length < 10) {
      errs.descripcion = 'Describe el problema con al menos 10 caracteres.';
    } else if (descripcion.trim().length > DESCRIPCION_MAX) {
      errs.descripcion = `La descripción no puede superar los ${DESCRIPCION_MAX} caracteres.`;
    }
    setErrores(errs);
    return Object.keys(errs).length === 0;
  }

  function submit() {
    if (loading) return;
    setIntento(true);
    const v = validar();
    if (!v) { setError(''); return; }
    const nombreTipo = etiquetaTipo(tipo);
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
    try {
      const r = await api.post('/incidentes', {
        tipo,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        ...(reservaId ? { reserva_id: reservaId } : {}),
      });
      setOk(r.data.id);
      // El borrador ya se consumió: la app reinicia el formulario.
      onEnviado?.();
    } catch (e) {
      setError(e?.message ?? 'No se pudo enviar el reporte.');
    } finally {
      setLoading(false);
    }
  }

  // Vuelve al formulario vacío para reportar otro problema.
  function otroReporte() {
    setOk(null);
    setTitulo('');
    setDescripcion('');
    setError('');
    setErrores({});
    setIntento(false);
    setTipo(TIPO_POR_DEFECTO);
  }

  if (ok !== null) {
    return (
      <View style={styles.exito}>
        <Text style={styles.title} accessibilityRole="header">Reporte #{ok} creado</Text>
        <Text style={styles.sub}>El equipo de soporte te responderá aquí mismo. Puedes seguirlo en Mis incidentes.</Text>
        <AppButton title="Ver mis incidentes" onPress={() => onCreated?.(ok)} />
        <AppButton title="Reportar otro problema" onPress={otroReporte} variant="ghost" />
      </View>
    );
  }

  return (
    <FormScrollView style={styles.root} contentContainerStyle={styles.content} bottomPadding={theme.spacing.lg}>
      <Text style={styles.title} accessibilityRole="header">Reportar problema</Text>
      {reservaSel && <Text style={styles.aviso}>Reportando sobre {reservaSel.codigo}</Text>}
      <ErrorBanner message={error} />
      <Text style={styles.label} accessibilityRole="header">Tipo de problema</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optsFila}>
        {TIPOS.map((t) => (
          <Chip
            key={t}
            label={etiquetaTipo(t)}
            active={tipo === t}
            onPress={() => setTipo(t)}
            accessibilityLabel={`Tipo de problema: ${etiquetaTipo(t)}`}
          />
        ))}
      </ScrollView>
      {intento && errores.tipo ? (
        <Text style={styles.errorTexto} accessibilityRole="alert">{errores.tipo}</Text>
      ) : null}
      <Text style={styles.ayuda}>{AYUDA_TIPO?.[tipo] || ''}</Text>
      <Text style={styles.label} accessibilityRole="header">Reserva relacionada (opcional)</Text>
      {reservasError !== '' && <Text style={styles.muted}>{reservasError}</Text>}
      <View style={styles.opts}>
        <Chip
          label="Sin reserva"
          active={reservaId === null}
          onPress={() => setReservaId(null)}
          accessibilityLabel="Reportar sin reserva"
        />
        {reservas?.map((r) => (
          <Chip
            key={r?.id}
            label={detalleReserva(r)}
            active={reservaId === r?.id}
            onPress={() => setReservaId(r?.id)}
            accessibilityLabel={`Reserva ${r?.codigo ?? ''}`}
          />
        ))}
      </View>
      <AppInput
        label="Título del reporte"
        value={titulo}
        onChangeText={setTitulo}
        placeholder="Ej. Vuelo cancelado y estoy varada"
        maxLen={TITULO_MAX}
        autoCap="sentences"
        noCorrect
        returnKey="next"
        error={intento ? errores.titulo : ''}
        hint={`Máximo ${TITULO_MAX} caracteres.`}
        required
      />
      <AppInput
        label="Descripción del problema"
        value={descripcion}
        onChangeText={setDescripcion}
        placeholder="Contanos qué pasó, n° de vuelo o reserva…"
        lines={5}
        maxLen={DESCRIPCION_MAX}
        noCorrect
        returnKey="send"
        onSubmit={submit}
        error={intento ? errores.descripcion : ''}
        hint={`Máximo ${DESCRIPCION_MAX} caracteres.`}
        required
      />
      <AppButton title="Enviar reporte" onPress={submit} loading={loading} />
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  exito: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md, justifyContent: 'center' },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.body, color: theme.colors.text },
  aviso: { fontSize: theme.type.body, fontWeight: 'bold', color: theme.colors.primary, backgroundColor: '#EDE7FB', borderRadius: theme.radius.md, padding: theme.spacing.sm },
  ayuda: { fontSize: theme.type.caption, color: theme.colors.muted, fontStyle: 'italic' },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold', marginTop: theme.spacing.sm },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, paddingVertical: 2 },
  optsFila: { flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: 2 },
  errorTexto: { fontSize: theme.type.caption, color: theme.colors.criticalText, fontWeight: 'bold' },
});
