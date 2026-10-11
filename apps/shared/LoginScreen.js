// Login compartido por las dos apps: valida inline, muestra error comprensible,
// feedback de carga y estado de conexion con la API.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from './theme.js';
import { api } from './api.js';
import { AppButton, AppInput, ApiWarning, ErrorBanner, FormScrollView } from './components.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({
  onSuccess,
  goRegister,
  roles = ['viajero'],
  titulo = 'Despegar',
  subtitulo = '',
  permitirRegistro = false,
  textoRegistro = 'Crear cuenta',
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiOk, setApiOk] = useState(null);
  const [probando, setProbando] = useState(false);
  const insets = useSafeAreaInsets();

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
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) { setError('Ingresa un email válido.'); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setLoading(true);
    try {
      const r = await api.login(mail, password);
      const rol = r?.user?.rol;
      if (roles && roles.length && !roles.includes(rol)) {
        setError(
          rol === 'admin'
            ? 'Esta cuenta es de administración: usá la app de soporte.'
            : 'Esta app es solo para agentes de soporte.'
        );
        return;
      }
      onSuccess(r.token, r.refresh_token, r.user);
    } catch (e) {
      setError(e?.status === 401 ? 'Email o contraseña incorrectos.' : (e?.message ?? 'No se pudo ingresar.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.lg },
      ]}
      bottomPadding={insets.bottom + theme.spacing.lg}
    >
      <Text style={styles.title}>{titulo}</Text>
      {subtitulo ? <Text style={styles.sub}>{subtitulo}</Text> : null}
      <ApiWarning />
      <View style={styles.estado} accessibilityRole="text">
        <View style={[styles.punto, apiOk === true && styles.puntoOk, apiOk === false && styles.puntoFail]} />
        <Text style={styles.estadoTexto} accessibilityLiveRegion="polite">
          {apiOk === null ? 'Conectando…' : apiOk ? 'Conectado' : 'Sin conexión'}
        </Text>
        {apiOk === false && (
          <Pressable
            onPress={probar}
            accessibilityRole="button"
            accessibilityLabel="Reintentar la conexión con el servidor"
            hitSlop={8}
            style={styles.reintentar}
          >
            <Text style={styles.reintentarTexto}>{probando ? 'Reintentando…' : 'Reintentar'}</Text>
          </Pressable>
        )}
      </View>
      <ErrorBanner message={error} />
      <AppInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="ejemplo@ejemplo.com"
        keyboard="email-address"
        autoCap="none"
        noCorrect
        maxLen={160}
      />
      <AppInput
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Tu contraseña"
        secure
        autoCap="none"
        noCorrect
        maxLen={72}
      />
      <AppButton title="Ingresar" onPress={submit} loading={loading} />
      {permitirRegistro ? (
        <AppButton title={textoRegistro} onPress={goRegister} variant="ghost" />
      ) : null}
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
  reintentar: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { fontSize: theme.type.caption, color: theme.colors.primary, fontWeight: 'bold' },
});
