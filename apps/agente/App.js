// App agente F6: sesión (F4) + cola y detalle de gestión.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../shared/theme';
import { api, setAuthToken, clearAuthToken, setOnUnauthorized } from '../shared/api';
import { authStore } from '../shared/auth';
import { LoginScreen } from './screens/LoginScreen';
import { ColaScreen } from './screens/ColaScreen';
import { DetalleGestionScreen } from './screens/DetalleGestionScreen';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [detalleId, setDetalleId] = useState(null);
  const [colaKey, setColaKey] = useState(0);

  async function logout() {
    try {
      await authStore.clearSession();
    } catch (e) {
      /* storage roto o no disponible: igual se limpia el estado en memoria */
    }
    clearAuthToken();
    setUser(null);
    setDetalleId(null);
  }

  useEffect(() => {
    setOnUnauthorized(() => logout());
    (async () => {
      try {
        const token = await authStore.getToken();
        const savedUser = await authStore.getUser();
        if (token && savedUser) {
          setAuthToken(token);
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

  async function handleSuccess(token, nextUser) {
    await authStore.saveSession(token, nextUser);
    setAuthToken(token);
    setUser(nextUser);
  }

  if (!ready) {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>;
  }
  if (!user) return <LoginScreen onSuccess={handleSuccess} />;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.hello}>Soporte · {user.nombre}</Text>
        <Pressable onPress={logout} accessibilityRole="button"><Text style={styles.exit}>Salir</Text></Pressable>
      </View>
      <View style={styles.body}>
        {detalleId !== null ? (
          <DetalleGestionScreen id={detalleId} onBack={() => { setDetalleId(null); setColaKey((k) => k + 1); }} />
        ) : (
          <ColaScreen onOpen={setDetalleId} refreshKey={colaKey} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md },
  hello: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  exit: { color: theme.colors.primary, fontWeight: 'bold', minHeight: theme.touch, textAlignVertical: 'center' },
  body: { flex: 1 },
});
