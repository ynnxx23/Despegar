// App viajero: sesión compartida (apps/shared/session.js) + navegación por
// pestañas sin librerías: Itinerario · Reportar · Mis incidentes · Ayuda (+ detalle).
// Reglas: un error de red NO destruye la sesión (lo resuelve useSession) y las
// pantallas de pestaña quedan montadas para no perder el borrador del reporte.
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../shared/theme';
import { useSession } from '../shared/session';
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
  const session = useSession({ roles: ['viajero'] });
  const [modoAuth, setModoAuth] = useState('login');
  const [tab, setTab] = useState('itinerario');
  const [detalleId, setDetalleId] = useState(null);
  const [miosKey, setMiosKey] = useState(0);
  const [reservaPresel, setReservaPresel] = useState(null);
  const [nuevoReset, setNuevoReset] = useState(0);
  const [reportEnviado, setReportEnviado] = useState(false);
  // Una pestaña se monta la primera vez que se abre y después nunca se desmonta:
  // así el borrador del reporte sobrevive al cambio de pestaña.
  const [visitados, setVisitados] = useState({ itinerario: true });

  function verTab(key) {
    setVisitados((v) => (v[key] ? v : { ...v, [key]: true }));
  }

  // El formulario de reporte solo se reinicia después de un envío exitoso.
  function limpiarFormulario() {
    setNuevoReset((k) => k + 1);
    setReportEnviado(false);
  }

  function goTab(key) {
    verTab(key);
    setTab(key);
    if (key === 'nuevo' && tab !== 'nuevo' && reportEnviado) limpiarFormulario();
  }

  function handleReportar(reservaId) {
    setReservaPresel(reservaId ?? null);
    verTab('nuevo');
    if (reportEnviado) limpiarFormulario();
    setDetalleId(null);
    setTab('nuevo');
  }

  function handleCreated(id) {
    verTab('mios');
    setDetalleId(id);
    setTab('mios');
  }

  async function salir() {
    await session.logout();
    setTab('itinerario');
    setDetalleId(null);
    setReservaPresel(null);
    setReportEnviado(false);
    setMiosKey(0);
    setModoAuth('login');
  }

  // Salir es una acción destructiva: se pide confirmación.
  function confirmarSalida() {
    Alert.alert(
      'Cerrar sesión',
      'Vas a salir de tu cuenta en este dispositivo. Podés volver a entrar cuando quieras.',
      [
        { text: 'Seguir aquí', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: salir },
      ]
    );
  }

  function renderPantalla(key) {
    if (key === 'itinerario') return <ItinerarioScreen onReportar={handleReportar} />;
    if (key === 'nuevo') {
      return (
        <NuevoIncidenteScreen
          reservaIdInicial={reservaPresel}
          resetKey={nuevoReset}
          onCreated={handleCreated}
          onEnviado={() => setReportEnviado(true)}
        />
      );
    }
    if (key === 'mios') {
      return (
        <MisIncidentesScreen onOpen={setDetalleId} refreshKey={miosKey} onReportar={handleReportar} />
      );
    }
    if (key === 'perfil') return <PerfilScreen user={session.user} onLogout={confirmarSalida} />;
    return <AyudaScreen />;
  }

  if (session.estado === 'cargando') {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Cargando la sesión" />
      </View>
    );
  }

  if (session.estado !== 'app' || !session.user) {
    return (
      <View style={[styles.authRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {modoAuth === 'register' ? (
          <RegisterScreen
            onSuccess={(token, refresh, user) => session.login(token, refresh, user)}
            goLogin={() => setModoAuth('login')}
          />
        ) : (
          <LoginScreen
            onSuccess={(token, refresh, user) => session.login(token, refresh, user)}
            goRegister={() => setModoAuth('register')}
          />
        )}
      </View>
    );
  }

  const user = session.user;
  const inicial = String(user?.nombre || user?.email || 'V').trim().charAt(0).toUpperCase() || 'V';

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <View style={styles.userRow}>
          <View style={styles.avatar} accessible accessibilityLabel={`Perfil de ${user?.nombre || 'viajero'}`}>
            <Text style={styles.avatarText}>{inicial}</Text>
          </View>
          <Text style={styles.hello}>Hola, {user?.nombre || 'Viajero'}</Text>
        </View>
        <Pressable
          onPress={confirmarSalida}
          accessibilityRole="button"
          accessibilityLabel="Salir de la cuenta"
          style={styles.exitBtn}
        >
          <Text style={styles.exit}>Salir</Text>
        </Pressable>
      </View>

      {session.sinConexion && (
        <View style={styles.sinConexion} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.sinConexionTexto}>
            Sin conexión con el servidor. Podés seguir usando la app; los datos se actualizan al volver la señal.
          </Text>
          <Pressable
            onPress={session.reintentar}
            accessibilityRole="button"
            accessibilityLabel="Reintentar la conexión con el servidor"
            style={styles.reintentar}
          >
            <Text style={styles.reintentarTexto}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.body}>
        {TABS.filter((t) => visitados[t.key]).map((t) => (
          <View
            key={t.key}
            style={[styles.pane, tab !== t.key && styles.paneOculto]}
            pointerEvents={tab === t.key ? 'auto' : 'none'}
            accessibilityElementsHidden={tab !== t.key}
            importantForAccessibility={tab === t.key ? 'auto' : 'no-hide-descendants'}
          >
            {renderPantalla(t.key)}
          </View>
        ))}
        {detalleId !== null && (
          <View style={styles.detalle}>
            <DetalleIncidenteScreen
              id={detalleId}
              onBack={() => { setDetalleId(null); setMiosKey((k) => k + 1); }}
            />
          </View>
        )}
      </View>

      {detalleId === null && (
        <View style={[styles.tabs, { paddingBottom: insets.bottom, minHeight: 56 + insets.bottom }]}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => goTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              accessibilityRole="button"
              accessibilityLabel={`Ir a ${t.label}`}
              accessibilityState={{ selected: tab === t.key }}
            >
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
  exitBtn: { minHeight: theme.touch, justifyContent: 'center', paddingHorizontal: theme.spacing.sm },
  exit: { color: theme.colors.primary, fontWeight: 'bold' },
  sinConexion: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: theme.colors.warning,
    borderRadius: theme.radius.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
    gap: 4,
  },
  sinConexionTexto: { color: theme.colors.text, fontSize: theme.type.caption },
  reintentar: { minHeight: 44, justifyContent: 'center' },
  reintentarTexto: { color: theme.colors.warning, fontSize: theme.type.caption, fontWeight: 'bold' },
  body: { flex: 1 },
  pane: { flex: 1 },
  paneOculto: { display: 'none' },
  detalle: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.background },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.card },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabActive: { borderTopWidth: 3, borderTopColor: theme.colors.primary },
  tabText: { color: theme.colors.muted },
  tabTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
});
