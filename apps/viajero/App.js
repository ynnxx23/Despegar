// App viajero F5: sesión (F4) + navegación por pestañas sin librerías:
// Itinerario · Reportar · Mis incidentes · Ayuda (+ detalle). Header con salida.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../shared/theme';
import { api, setAuthToken, clearAuthToken, setOnUnauthorized } from '../shared/api';
import { authStore } from '../shared/auth';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { ItinerarioScreen } from './screens/ItinerarioScreen';
import { NuevoIncidenteScreen } from './screens/NuevoIncidenteScreen';
import { MisIncidentesScreen } from './screens/MisIncidentesScreen';
import { DetalleIncidenteScreen } from './screens/DetalleIncidenteScreen';
import { AyudaScreen } from './screens/AyudaScreen';
import { PerfilScreen } from './screens/PerfilScreen';

const TABS = [
  { key: 'itinerario', label: 'Viajes' },
  { key: 'nuevo', label: 'Reportar' },
  { key: 'mios', label: 'Incidentes' },
  { key: 'ayuda', label: 'Ayuda' },
  { key: 'perfil', label: 'Perfil' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const insets = useSafeAreaInsets();
  const [auth, setAuth] = useState('login');
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('itinerario');
  const [detalleId, setDetalleId] = useState(null);
  const [miosKey, setMiosKey] = useState(0);
  const [reservaPresel, setReservaPresel] = useState(null);
  const [nuevoKey, setNuevoKey] = useState(0);

  async function logout() {
    try {
      const refreshToken = await authStore.getRefreshToken();
      if (refreshToken) api.logout(refreshToken).catch(() => {});
    } catch (e) {
      /* sin red: la sesion local se limpia igual */
    }
    try {
      await authStore.clearSession();
    } catch (e) {
      /* storage roto o no disponible: igual se limpia el estado en memoria */
    }
    clearAuthToken();
    setUser(null);
    setAuth('login');
    setTab('itinerario');
    setDetalleId(null);
    setReservaPresel(null);
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
            setUser(r.user);
            setAuth('app');
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

  async function handleSuccess(token, refreshToken, nextUser) {
    await authStore.saveSession(token, refreshToken, nextUser);
    setAuthToken(token);
    setUser(nextUser);
    setAuth('app');
  }

  function handleReportar(reservaId) {
    setReservaPresel(reservaId ?? null);
    setNuevoKey((k) => k + 1);
    setDetalleId(null);
    setTab('nuevo');
  }

  function goTab(key) {
    setTab(key);
    if (key === 'nuevo') {
      setReservaPresel(null);
      setNuevoKey((k) => k + 1);
    }
  }

  if (!ready) {
    return <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><ActivityIndicator color={theme.colors.primary} /></View>;
  }
  if (auth !== 'app' || !user) {
    return (
      <View style={[styles.authRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {auth === 'register'
          ? <RegisterScreen onSuccess={handleSuccess} goLogin={() => setAuth('login')} />
          : <LoginScreen onSuccess={handleSuccess} goRegister={() => setAuth('register')} />}
      </View>
    );
  }

  const inicial = String(user?.nombre || user?.email || 'V').trim().charAt(0).toUpperCase() || 'V';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{inicial}</Text>
          </View>
          <Text style={styles.hello}>Hola, {user?.nombre || 'Viajero'}</Text>
        </View>
        <Pressable onPress={logout} accessibilityRole="button"><Text style={styles.exit}>Salir</Text></Pressable>
      </View>
      <View style={styles.body}>
        {detalleId !== null ? (
          <DetalleIncidenteScreen id={detalleId} onBack={() => { setDetalleId(null); setMiosKey((k) => k + 1); }} />
        ) : tab === 'itinerario' ? (
          <ItinerarioScreen onReportar={handleReportar} />
        ) : tab === 'nuevo' ? (
          <NuevoIncidenteScreen key={nuevoKey} reservaIdInicial={reservaPresel} onCreated={(id) => { setDetalleId(id); setTab('mios'); }} />
        ) : tab === 'mios' ? (
          <MisIncidentesScreen onOpen={setDetalleId} refreshKey={miosKey} onReportar={handleReportar} />
        ) : tab === 'perfil' ? (
          <PerfilScreen user={user} onLogout={logout} />
        ) : (
          <AyudaScreen />
        )}
      </View>
      {detalleId === null && (
        <View style={[styles.tabs, { paddingBottom: insets.bottom, minHeight: 56 + insets.bottom }]}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => goTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]} accessibilityRole="button" accessibilityLabel={`Ir a ${t.label}`} accessibilityState={{ selected: tab === t.key }}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  authRoot: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: theme.type.subtitle },
  hello: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  exit: { color: theme.colors.primary, fontWeight: 'bold', minHeight: theme.touch, textAlignVertical: 'center' },
  body: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.card },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabActive: { borderTopWidth: 3, borderTopColor: theme.colors.primary },
  tabText: { color: theme.colors.muted },
  tabTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
});
