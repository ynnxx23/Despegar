// Ayuda al viajero: FAQ local en acordeon + contacto de soporte (sin links externos).
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';

const PREGUNTAS = [
  {
    q: 'Mi vuelo fue cancelado, ¿qué hago?',
    a: 'Reportalo desde la pestaña Reportar con el código de reserva y el número de vuelo. Te respondemos en la app con las opciones: reprogramación o reembolso.',
  },
  {
    q: '¿Dónde veo mi reembolso?',
    a: 'Cuando el agente confirme el reembolso, lo ves en el hilo de tu incidente en Mis incidentes. El dinero vuelve al medio de pago original en unos días hábiles.',
  },
  {
    q: '¿Cuánto tardan en responder?',
    a: 'La mayoría de los reportes se responde en menos de 24 horas. Los casos de fraude o vuelos en curso salen antes.',
  },
  {
    q: '¿Qué datos incluyo al reportar?',
    a: 'Código de reserva, fecha del viaje, número de vuelo u hotel, y una descripción corta de qué pasó. Cuantos más datos, más rápida la respuesta.',
  },
  {
    q: '¿Cómo hablo con un agente?',
    a: 'Creá un reporte y el agente te contesta en el hilo del incidente. Todo queda escrito ahí para que no pierdas nada.',
  },
  {
    q: 'No puedo entrar a mi cuenta, ¿qué hago?',
    a: 'Revisá que el email esté bien escrito y que la contraseña tenga al menos 8 caracteres. Si ya tenés cuenta y falla, probá recuperar el acceso o escribinos desde Reportar.',
  },
  {
    q: '¿Puedo reportar sin tener una reserva?',
    a: 'Sí. Elegí la opción Sin reserva y contanos qué pasó. Igual te conviene asociar la reserva si la tenés para que el agente ubique tu caso más rápido.',
  },
  {
    q: 'Vuelo cancelado, ¿qué datos incluyo?',
    a: 'Indicá N° de vuelo y aeropuerto. Si tenés, sumá código de reserva y qué te ofreció la aerolínea.',
  },
  {
    q: 'Vuelo retrasado, ¿qué datos incluyo?',
    a: 'Indicá N° de vuelo y horas de demora. Sumá aeropuerto y código de reserva si lo tenés.',
  },
  {
    q: 'Hotel sin reserva, ¿qué datos incluyo?',
    a: 'Indicá hotel, ciudad y fecha de check-in. Agregá código de reserva y comprobante si tenés.',
  },
  {
    q: 'Equipaje perdido o dañado, ¿qué hago?',
    a: 'Describí valija + N° de reclamo aerolínea si tenés. Contá dónde la viste por última vez y qué tenía adentro.',
  },
  {
    q: 'Cobro indebido, ¿qué informo?',
    a: 'Indicá monto, fecha y últimos 4 dígitos (nunca el número completo). Adjuntá contexto del cargo si podés.',
  },
  {
    q: 'Fraude o estafa, ¿cómo lo reporto?',
    a: 'Describí qué pasó sin incluir claves ni CBU completos. Contá fecha, monto y por qué canal te contactaron.',
  },
  {
    q: '¿Cuánto tardan en responder por tipo?',
    a: 'Fraude: mismo día, resto: 24-72 h. Si tu vuelo sale en pocas horas, aclaralo en el título para que te ubiquemos antes.',
  },
  {
    q: '¿Quién atiende mi caso?',
    a: 'Cuando reportás, tu caso entra en cola y se lo asignamos a un agente de soporte. Ves su nombre en Mis incidentes y en el detalle como "Lo atiende". Te avisamos cada novedad ahí mismo.',
  },
];

export function AyudaScreen() {
  const [abierta, setAbierta] = useState(null);
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    api.health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  function toggle(i) {
    setAbierta(abierta === i ? null : i);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">Ayuda</Text>
      <Text style={styles.sub}>Preguntas frecuentes y contacto de soporte.</Text>
      {PREGUNTAS.map((f, i) => {
        const open = abierta === i;
        return (
          <View key={f.q} style={styles.card}>
            <Pressable
              onPress={() => toggle(i)}
              accessibilityRole="button"
              accessibilityLabel={f.q}
              accessibilityHint={open ? 'Oculta la respuesta' : 'Muestra la respuesta'}
              accessibilityState={{ expanded: open }}
              style={styles.fila}
            >
              <Text style={styles.pregunta}>{f.q}</Text>
              <Text style={styles.signo} importantForAccessibility="no">{open ? '−' : '+'}</Text>
            </Pressable>
            {open ? (
              <Text style={styles.respuesta} accessibilityLiveRegion="polite">{f.a}</Text>
            ) : null}
          </View>
        );
      })}
      <View style={styles.card} accessible accessibilityLabel="Quién atiende mi caso">
        <Text style={styles.pregunta} accessibilityRole="header">Quién atiende mi caso</Text>
        <Text style={styles.respuesta}>
          Tu reporte lo toma un agente del equipo de soporte. Ni bien se asigna, ves "Lo atiende" con su nombre en tu incidente. Si aún no tiene agente, ves "En revisión por el equipo". Todo aviso llega al detalle de tu caso, no hace falta llamar.
        </Text>
      </View>
      <View style={styles.card} accessible accessibilityLabel="Contacto de soporte">
        <Text style={styles.pregunta} accessibilityRole="header">Contacto de soporte</Text>
        <Text style={styles.respuesta}>
          Escribinos desde la pestaña Reportar y te contestamos en la app, en Mis incidentes. Horario: todos los días de 8 a 22 h.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.pregunta} accessibilityRole="header">Estado del servicio</Text>
        <View style={styles.estado} accessible accessibilityLiveRegion="polite">
          <View style={[styles.punto, apiOk === true && styles.puntoOk, apiOk === false && styles.puntoFail]} importantForAccessibility="no" />
          <Text style={styles.respuesta}>
            {apiOk === null ? 'Consultando estado…' : apiOk ? 'Servicio disponible' : 'Servicio no disponible'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm, minHeight: theme.touch },
  pregunta: { flex: 1, fontSize: theme.type.body, fontWeight: 'bold', color: theme.colors.text },
  signo: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.primary },
  respuesta: { fontSize: theme.type.body, color: theme.colors.text },
  estado: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.muted },
  puntoOk: { backgroundColor: theme.colors.success },
  puntoFail: { backgroundColor: theme.colors.critical },
});
