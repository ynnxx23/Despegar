// Login agente: sin registro público (decisión plan §22: agentes por seed/admin).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, ApiWarning, ErrorBanner, FormScrollView } from '../../shared/components';

const APP_VERSION = 'v0.1.0';

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
      onSuccess?.(r.token, r.refresh_token, r.user);
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
      setSaludError('Sin conexión con el servidor.');
    } finally {
      setProbando(false);
    }
  }

  return (
    <FormScrollView
      style={styles.flex}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.lg }]}
      bottomPadding={insets.bottom + theme.spacing.lg}
    >
      <Text style={styles.title}>Centro de Resolución</Text>
      <Text style={styles.sub}>Acceso interno de agentes. Sin registro público.</Text>
      <ApiWarning />
      <ErrorBanner message={error} />
      <AppInput label="Email corporativo" value={email} onChangeText={setEmail} placeholder="ejemplo@gmail.com" keyboard="email-address" autoCap="none" />
      <AppInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secure autoCap="none" />
      <AppButton title="Ingresar" onPress={submit} loading={loading} />
      <View style={styles.ops}>
        <AppButton title={probando ? 'Probando…' : 'Probar conexión'} variant="ghost" onPress={probarConexion} />
        {salud && <Text style={styles.ok} accessibilityRole="alert">{salud}</Text>}
        <ErrorBanner message={saludError} />
        <Text style={styles.version}>{APP_VERSION}</Text>
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  root: { flexGrow: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  ops: { gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  ok: { color: theme.colors.success, fontSize: theme.type.caption, fontWeight: 'bold' },
  version: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
});
