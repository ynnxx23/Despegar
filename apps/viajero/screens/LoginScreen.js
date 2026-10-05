// Login viajero: valida inline, muestra error comprensible, feedback de carga.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, ErrorBanner } from '../../shared/components';

export function LoginScreen({ onSuccess, goRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    api.health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  async function submit() {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Ingresa un email válido.'); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setLoading(true);
    try {
      const r = await api.login(email.trim().toLowerCase(), password);
      onSuccess(r.token, r.user);
    } catch (e) {
      setError(e.status === 401 ? 'Email o contraseña incorrectos.' : e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Despegar · Ayuda al Viajero</Text>
      <Text style={styles.sub}>Tus viajes y respuestas en un solo lugar.</Text>
      <View style={styles.estado}>
        <View style={[styles.punto, apiOk === true && styles.puntoOk, apiOk === false && styles.puntoFail]} />
        <Text style={styles.estadoTexto}>
          {apiOk === null ? 'Conectando…' : apiOk ? 'Servicio disponible' : 'Sin conexión'}
        </Text>
      </View>
      <ErrorBanner message={error} />
      <AppInput label="Email" value={email} onChangeText={setEmail} placeholder="ana@test.com" keyboard="email-address" autoCap="none" />
      <AppInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secure autoCap="none" />
      <AppButton title="Ingresar" onPress={submit} loading={loading} />
      <AppButton title="Crear cuenta" onPress={goRegister} variant="ghost" />
      <Text style={styles.hint}>Demo: ana@test.com / Viaje1234</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  estado: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.muted },
  puntoOk: { backgroundColor: theme.colors.success },
  puntoFail: { backgroundColor: theme.colors.critical },
  estadoTexto: { fontSize: theme.type.caption, color: theme.colors.text },
  hint: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
});
