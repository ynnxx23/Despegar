// Perfil del viajero: datos de cuenta, sesion con confirmacion y version.
import { Alert, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { AppButton } from '../../shared/components';

export function PerfilScreen({ user, onLogout }) {
  const nombre = String(user?.nombre || 'Viajero').trim() || 'Viajero';
  const email = String(user?.email || 'Sin email').trim() || 'Sin email';
  const inicial = (nombre || email || 'V').trim().charAt(0).toUpperCase() || 'V';

  function confirmarSalida() {
    Alert.alert(
      'Cerrar sesion',
      'Vas a salir de tu cuenta en este dispositivo. Podes volver a entrar cuando quieras.',
      [
        { text: 'Seguir aqui', style: 'cancel' },
        { text: 'Cerrar sesion', style: 'destructive', onPress: () => onLogout?.() },
      ]
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.perfil}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <Text style={styles.nombre}>{nombre}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mi cuenta</Text>
        <Text style={styles.fila}>Email: {email}</Text>
        <Text style={styles.fila}>Rol: Viajero</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sesion</Text>
        <Text style={styles.muted}>Si usas un dispositivo compartido, cerra la sesion al terminar.</Text>
        <AppButton title="Cerrar sesion" onPress={confirmarSalida} variant="ghost" />
      </View>
      <Text style={styles.version}>Version v0.1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, gap: theme.spacing.md },
  perfil: { alignItems: 'center', gap: 4, paddingVertical: theme.spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 28 },
  nombre: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  email: { fontSize: theme.type.caption, color: theme.colors.muted },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm },
  cardTitle: { fontSize: theme.type.body, fontWeight: 'bold', color: theme.colors.text },
  fila: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  version: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center', marginTop: theme.spacing.sm },
});
