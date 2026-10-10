// Login viajero: valida inline, muestra error comprensible, feedback de carga.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, ApiWarning, ErrorBanner, FormScrollView } from '../../shared/components';

export function LoginScreen({ onSuccess, goRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiOk, setApiOk] = useState(null);
  const [probando, setProbando] = useState(false);

  const probar = useCallback(async () => {
    setProbando(true);
    try {
      await api.health();
      setApiOk(true);
    } catch (e) {
      setApiOk(false);
    } finally {
      setProbando(false);
    }
  }, []);

  useEffect(() => {
    probar();
  }, [probar]);

  async function submit() {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Ingresa un email válido.'); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setLoading(true);
    try {
      const r = await api.login(email.trim().toLowerCase(), password);
      onSuccess(r.token, r.refresh_token, r.user);
    } catch (e) {
      setError(e.status === 401 ? 'Email o contraseña incorrectos.' : e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScrollView style={styles.flex} contentContainerStyle={styles.root} bottomPadding={theme.spacing.lg}>
      <Text style={styles.title}>Despegar · Ayuda al Viajero</Text>
      <Text style={styles.sub}>Tus viajes y respuestas en un solo lugar.</Text>
      <ApiWarning />
      <View style={styles.estado}>
        <View style={[styles.punto, apiOk === true && styles.puntoOk, apiOk === false && styles.puntoFail]} />
        <Text style={styles.estadoTexto}>
          {apiOk === null ? 'Conectando…' : apiOk ? 'Conectado' : 'Sin conexión'}
        </Text>
        {apiOk === false && (
          <Pressable onPress={probar} accessibilityRole="button" hitSlop={8} style={styles.reintentar}>
            <Text style={styles.reintentarTexto}>{probando ? 'Reintentando…' : 'Reintentar'}</Text>
          </Pressable>
        )}
      </View>
      <ErrorBanner message={error} />
      <AppInput label="Email" value={email} onChangeText={setEmail} placeholder="ejemplo@ejemplo.com" keyboard="email-address" autoCap="none" />
      <AppInput label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secure autoCap="none" />
      <AppButton title="Ingresar" onPress={submit} loading={loading} />
      <AppButton title="Crear cuenta" onPress={goRegister} variant="ghost" />
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  root: { flexGrow: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  estado: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  punto: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.muted },
  puntoOk: { backgroundColor: theme.colors.success },
  puntoFail: { backgroundColor: theme.colors.critical },
  estadoTexto: { fontSize: theme.type.caption, color: theme.colors.text },
  reintentar: { marginLeft: 'auto' },
  reintentarTexto: { fontSize: theme.type.caption, color: theme.colors.primary, fontWeight: 'bold' },
});
