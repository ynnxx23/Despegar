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
      <Text style={styles.title}>Ayuda</Text>
      <Text style={styles.sub}>Preguntas frecuentes y contacto de soporte.</Text>
      {PREGUNTAS.map((f, i) => {
        const open = abierta === i;
        return (
          <View key={f.q} style={styles.card}>
            <Pressable onPress={() => toggle(i)} accessibilityRole="button" style={styles.fila}>
              <Text style={styles.pregunta}>{f.q}</Text>
              <Text style={styles.signo}>{open ? '−' : '+'}</Text>
            </Pressable>
            {open && <Text style={styles.respuesta}>{f.a}</Text>}
          </View>
        );
      })}
      <View style={styles.card}>
        <Text style={styles.pregunta}>Contacto de soporte</Text>
        <Text style={styles.respuesta}>
          Escribinos desde la pestaña Reportar y te contestamos en la app, en Mis incidentes. Horario: todos los días de 8 a 22 h.
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.pregunta}>Estado del servicio</Text>
        <View style={styles.estado}>
          <View style={[styles.punto, apiOk === true && styles.puntoOk, apiOk === false && styles.puntoFail]} />
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
