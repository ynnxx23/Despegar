// App agente F6: sesión (F4) + cola y detalle de gestión.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../shared/theme';
import { DespegarLogo } from '../shared/components';
import { NotificacionesScreen } from '../shared/NotificacionesScreen';
import { useNoLeidas } from '../shared/notificaciones';
import { api, setAuthToken, setAuthRefresh, clearAuthToken, setOnUnauthorized } from '../shared/api';
import { authStore } from '../shared/auth';
import { LoginScreen } from './screens/LoginScreen';
import { ColaScreen } from './screens/ColaScreen';
import { DetalleGestionScreen } from './screens/DetalleGestionScreen';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  const [colaKey, setColaKey] = useState(0);
  const [colaDirty, setColaDirty] = useState(false);

  async function logout() {
    try {
      const r = await authStore.getRefresh();
      if (r) await api.post('/logout', { refresh_token: r }).catch(() => null);
    } catch (e) { /* sale igual */ }
    try {
      await authStore.clearSession();
    } catch (e) {
      /* storage roto o no disponible: igual se limpia el estado en memoria */
    }
    clearAuthToken();
    setUser(null);
    setDetalleId(null);
    setColaDirty(false);
  }

  useEffect(() => {
    setOnUnauthorized(() => logout());
    (async () => {
      try {
        const token = await authStore.getToken();
        const savedUser = await authStore.getUser();
        const savedRefresh = await authStore.getRefresh();
        if (token && savedUser) {
          setAuthToken(token);
          setAuthRefresh(savedRefresh);
          try {
            const r = await api.me();
            if (r.user.rol === 'agente') setUser(r.user);
            else await logout();
          } catch (e) {
            await logout();
          }
        }
      } catch (e) {
        await logout();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  async function handleSuccess(token, nextUser, refresh = null) {
    await authStore.saveSession(token, nextUser, refresh);
    setAuthToken(token);
    setAuthRefresh(refresh);
    setUser(nextUser);
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>
      </SafeAreaProvider>
    );
  }
  if (!user) {
    return (
      <SafeAreaProvider>
        <LoginScreen onSuccess={handleSuccess} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Shell
        user={user}
        detalleId={detalleId}
        colaKey={colaKey}
        onLogout={logout}
        onOpen={(id) => { setColaDirty(false); setDetalleId(id); }}
        onBack={(dirty) => { setDetalleId(null); if (dirty || colaDirty) setColaKey((k) => k + 1); setColaDirty(false); }}
        onDirty={() => setColaDirty(true)}
      />
    </SafeAreaProvider>
  );
}

function Shell({ user, detalleId, colaKey, onLogout, onOpen, onBack, onDirty }) {
  const insets = useSafeAreaInsets();
  const [noLeidas] = useNoLeidas(api);
  const [vista, setVista] = useState('cola');
  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <View style={styles.brandRow}>
          <DespegarLogo size={32} />
          <Text style={styles.hello}>Soporte · {user.nombre}</Text>
        </View>
        <View style={styles.headBtns}>
          <Pressable onPress={() => setVista(vista === 'avisos' ? 'cola' : 'avisos')} accessibilityRole="button" accessibilityLabel="Ver avisos">
            <Text style={styles.bell}>🔔{noLeidas > 0 ? ` ${noLeidas}` : ''}</Text>
          </Pressable>
          <Pressable onPress={onLogout} accessibilityRole="button"><Text style={styles.exit}>Salir</Text></Pressable>
        </View>
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {vista === 'avisos' && detalleId === null ? (
          <NotificacionesScreen />
        ) : detalleId !== null ? (
          <DetalleGestionScreen id={detalleId} onBack={(dirty) => onBack?.(dirty)} onChange={() => onDirty?.()} />
        ) : (
          <ColaScreen user={user} onOpen={onOpen} refreshKey={colaKey} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md, backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  headBtns: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  bell: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text, minHeight: theme.touch, textAlignVertical: 'center' },
  hello: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  exit: { color: theme.colors.primary, fontWeight: 'bold', minHeight: theme.touch, textAlignVertical: 'center' },
  body: { flex: 1 },
});
