// App agente F6: sesión (F4) + cola, detalle de gestión y panel de administración
// (solo para el rol admin).
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../shared/theme';
import { useSession } from '../shared/session';
import { LoginScreen } from './screens/LoginScreen';
import { ColaScreen } from './screens/ColaScreen';
import { DetalleGestionScreen } from './screens/DetalleGestionScreen';
import { AdminUsuariosScreen } from './screens/AdminUsuariosScreen';

export default function App() {
  const session = useSession({ roles: ['agente', 'admin'] });

  if (session.estado === 'cargando') {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (session.estado !== 'app' || !session.user) {
    return (
      <SafeAreaProvider>
        <LoginScreen onSuccess={session.login} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <Shell
        user={session.user}
        sinConexion={session.sinConexion}
        onReintentar={session.reintentar}
        onLogout={session.logout}
      />
    </SafeAreaProvider>
  );
}

function Shell({ user, sinConexion, onReintentar, onLogout }) {
  const insets = useSafeAreaInsets();
  const [vista, setVista] = useState('cola');
  const [detalleId, setDetalleId] = useState(null);
  const [colaKey, setColaKey] = useState(0);
  const [colaDirty, setColaDirty] = useState(false);

  const esAdmin = user?.rol === 'admin';

  function confirmarSalir() {
    Alert.alert('Salir de la app', '¿Querés cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => onLogout() },
    ]);
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + theme.spacing.md }]}>
        <Text style={styles.hello}>Soporte · {user?.nombre}</Text>
        <View style={styles.headerAcciones}>
          {esAdmin ? (
            <Pressable
              onPress={() => { setDetalleId(null); setVista(vista === 'admin' ? 'cola' : 'admin'); }}
              style={styles.pestania}
              accessibilityRole="button"
              accessibilityLabel="Panel de administración de usuarios"
              accessibilityState={{ selected: vista === 'admin' }}
            >
              <Text style={[styles.pestaniaTexto, vista === 'admin' && styles.pestaniaTextoActivo]}>Administrar</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={confirmarSalir}
            style={styles.salir}
            accessibilityRole="button"
            accessibilityLabel="Salir de la app"
          >
            <Text style={styles.exit}>Salir</Text>
          </Pressable>
        </View>
      </View>

      {sinConexion ? (
        <View style={styles.sinConexion} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.sinConexionTexto}>Sin conexión con el servidor: los datos pueden estar desactualizados.</Text>
          <Pressable onPress={onReintentar} style={styles.reintentar} accessibilityRole="button" accessibilityLabel="Reintentar la conexión">
            <Text style={styles.reintentarTexto}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {detalleId !== null ? (
          <DetalleGestionScreen
            id={detalleId}
            onBack={(dirty) => { setDetalleId(null); if (dirty || colaDirty) setColaKey((k) => k + 1); setColaDirty(false); }}
            onChange={() => setColaDirty(true)}
          />
        ) : vista === 'admin' && esAdmin ? (
          <AdminUsuariosScreen user={user} onChange={() => setColaKey((k) => k + 1)} />
        ) : (
          <ColaScreen
            user={user}
            onOpen={(id) => { setColaDirty(false); setDetalleId(id); }}
            refreshKey={colaKey}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm },
  headerAcciones: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  hello: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  pestania: { minHeight: 44, paddingHorizontal: theme.spacing.md, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card },
  pestaniaTexto: { color: theme.colors.text, fontWeight: 'bold' },
  pestaniaTextoActivo: { color: theme.colors.primary },
  salir: { minHeight: theme.touch, justifyContent: 'center' },
  exit: { color: theme.colors.primary, fontWeight: 'bold', minHeight: theme.touch, textAlignVertical: 'center' },
  sinConexion: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: theme.colors.warning, marginHorizontal: theme.spacing.md, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 4 },
  sinConexionTexto: { color: theme.colors.text, fontSize: theme.type.caption },
  reintentar: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  reintentarTexto: { color: theme.colors.primary, fontWeight: 'bold', fontSize: theme.type.caption },
  body: { flex: 1 },
});
