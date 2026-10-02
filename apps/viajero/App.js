// App viajero F5: sesión (F4) + navegación por pestañas sin librerías:
// Itinerario · Reportar · Mis incidentes (+ detalle). Header con salida.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../shared/theme';
import { api, setAuthToken, clearAuthToken, setOnUnauthorized } from '../shared/api';
import { authStore } from '../shared/auth';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { ItinerarioScreen } from './screens/ItinerarioScreen';
import { NuevoIncidenteScreen } from './screens/NuevoIncidenteScreen';
import { MisIncidentesScreen, DetalleIncidenteScreen } from './screens/MisIncidentesScreen';

const TABS = [
  { key: 'itinerario', label: '🧳 Viajes' },
  { key: 'nuevo', label: '⚠ Reportar' },
  { key: 'mios', label: '📋 Incidentes' },
];

export default function App() {
  const [auth, setAuth] = useState('login');
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('itinerario');
  const [detalleId, setDetalleId] = useState(null);
  const [miosKey, setMiosKey] = useState(0);

  async function logout() {
    await authStore.clearSession();
    clearAuthToken();
    setUser(null);
    setAuth('login');
    setTab('itinerario');
    setDetalleId(null);
  }

  useEffect(() => {
    setOnUnauthorized(() => logout());
    (async () => {
      const [token, savedUser] = [await authStore.getToken(), await authStore.getUser()];
      if (token && savedUser) {
        setAuthToken(token);
        try {
          const r = await api.me();
          setUser(r.user);
          setAuth('app');
        } catch (e) {
          await logout();
        }
      }
      setReady(true);
    })();
  }, []);

  async function handleSuccess(token, nextUser) {
    await authStore.saveSession(token, nextUser);
    setAuthToken(token);
    setUser(nextUser);
    setAuth('app');
  }

  if (!ready) {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>;
  }
  if (auth !== 'app' || !user) {
    if (auth === 'register') return <RegisterScreen onSuccess={handleSuccess} goLogin={() => setAuth('login')} />;
    return <LoginScreen onSuccess={handleSuccess} goRegister={() => setAuth('register')} />;
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.hello}>Hola, {user.nombre}</Text>
        <Pressable onPress={logout} accessibilityRole="button"><Text style={styles.exit}>Salir</Text></Pressable>
      </View>
      <View style={styles.body}>
        {detalleId !== null ? (
          <DetalleIncidenteScreen id={detalleId} onBack={() => { setDetalleId(null); setMiosKey((k) => k + 1); }} />
        ) : tab === 'itinerario' ? (
          <ItinerarioScreen />
        ) : tab === 'nuevo' ? (
          <NuevoIncidenteScreen onCreated={(id) => { setDetalleId(id); setTab('mios'); }} />
        ) : (
          <MisIncidentesScreen onOpen={setDetalleId} refreshKey={miosKey} />
        )}
      </View>
      {detalleId === null && (
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]} accessibilityRole="button">
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
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
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.card },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabActive: { borderTopWidth: 3, borderTopColor: theme.colors.primary },
  tabText: { color: theme.colors.muted },
  tabTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
});
