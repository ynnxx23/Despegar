// Login agente: sin registro público (decisión plan §22: agentes por seed/admin).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api, API_HOST } from '../../shared/api';
import { AppButton, AppInput, ErrorBanner } from '../../shared/components';

const APP_VERSION = 'v0.1.0';

function apiHost() {
  return API_HOST || 'local';
}

export function LoginScreen({ onSuccess }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [salud, setSalud] = useState(null);
  const [saludError, setSaludError] = useState('');
  const [probando, setProbando] = useState(false);

  async function submit() {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Ingresa un email válido.'); return; }
    if (password.length < 1) { setError('Ingresa tu contraseña.'); return; }
    setLoading(true);
    try {
      const r = await api.login(email.trim().toLowerCase(), password);
      if (r?.user?.rol !== 'agente') { setError('Esta app es solo para agentes de soporte.'); return; }
      onSuccess?.(r.token, r.user);
    } catch (e) {
      setError(e?.status === 401 ? 'Email o contraseña incorrectos.' : (e?.message ?? 'No se pudo ingresar.'));
    } finally {
      setLoading(false);
    }
  }

  async function probarConexion() {
    setSalud(null);
    setSaludError('');
    setProbando(true);
    try {
      await api.health();
      setSalud('Conexión OK con el servidor.');
    } catch (e) {
      setSaludError(e?.message ?? 'Sin conexión con el servidor.');
    } finally {
      setProbando(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.lg }]}>
      <Text style={styles.title}>Centro de Resolución</Text>
      <Text style={styles.sub}>Acceso interno de agentes. Sin registro público.</Text>
      <ErrorBanner message={error} />
      <AppInput label="Email corporativo" value={email} onChangeText={setEmail} placeholder="agente@despegar.com" keyboard="email-address" autoCap="none" />
      <AppInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secure autoCap="none" />
      <AppButton title="Ingresar" onPress={submit} loading={loading} />
      <View style={styles.ops}>
        <Text style={styles.sub}>API: {apiHost()} · {APP_VERSION}</Text>
        <AppButton title={probando ? 'Probando…' : 'Probar conexión'} variant="ghost" onPress={probarConexion} />
        {salud && <Text style={styles.ok} accessibilityRole="alert">{salud}</Text>}
        <ErrorBanner message={saludError} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  ops: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  ok: { color: theme.colors.success, fontSize: theme.type.caption, fontWeight: 'bold' },
});
