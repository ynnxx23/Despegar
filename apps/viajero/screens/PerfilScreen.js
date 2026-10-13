// Perfil del viajero: datos, verificación email, sesiones y borrado GDPR.
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, ErrorBanner } from '../../shared/components';

export function PerfilScreen({ user, onLogout }) {
  const nombre = String(user?.nombre || 'Viajero').trim() || 'Viajero';
  const email = String(user?.email || 'Sin email').trim() || 'Sin email';
  const inicial = (nombre || email || 'V').trim().charAt(0).toUpperCase() || 'V';
  const verificado = user?.email_verificado === true;
  const [msg, setMsg] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pedido, setPedido] = useState(false);

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

  function cerrarTodas() {
    Alert.alert('Cerrar todo', 'Cierra tu sesión en todos los dispositivos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar todo', style: 'destructive', onPress: async () => {
          try {
            await api.post('/logout', { todos: true });
          } catch (e) { /* igual sale */ }
          onLogout?.();
        },
      },
    ]);
  }

  async function pedirCodigo() {
    setMsg('');
    try {
      const r = await api.post('/email/solicitar', {});
      setPedido(true);
      setMsg(r?.data?.token ? `Código (dev): ${r.data.token}` : 'Te enviamos un código a tu email.');
    } catch (e) {
      setMsg(e?.message ?? 'No pudimos enviar el código.');
    }
  }

  async function verificar() {
    setMsg('');
    if (codigo.trim() === '') {
      setMsg('Ingresá el código.');
      return;
    }
    try {
      await api.post('/email/verificar', { token: codigo.trim() });
      setMsg('Email verificado.');
      setPedido(false);
    } catch (e) {
      setMsg(e?.message ?? 'Código inválido.');
    }
  }

  function borrarCuenta() {
    Alert.alert(
      'Eliminar cuenta',
      'Se borran tus reservas, archivos y sesiones. Tus reportes quedan anónimos. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await api.del('/me');
            } catch (e) {
              setMsg(e?.message ?? 'No pudimos eliminar la cuenta.');
              return;
            }
            onLogout?.();
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
        <Text style={styles.fila}>Verificado: {verificado ? 'Sí' : 'No'}</Text>
        {!verificado && <AppButton title="Enviar código" onPress={pedirCodigo} variant="ghost" />}
        {pedido && (
          <View style={styles.verifyRow}>
            <TextInput
              style={styles.input} value={codigo} onChangeText={setCodigo}
              placeholder="Código" placeholderTextColor={theme.colors.muted}
              autoCapitalize="none" maxLength={64}
            />
            <AppButton title="Verificar" onPress={verificar} variant="ghost" />
          </View>
        )}
      </View>
      <ErrorBanner message={msg} />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sesion</Text>
        <Text style={styles.muted}>Si usas un dispositivo compartido, cerra la sesion al terminar.</Text>
        <AppButton title="Cerrar sesion" onPress={confirmarSalida} variant="ghost" />
        <AppButton title="Cerrar en todos lados" onPress={cerrarTodas} variant="ghost" />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacidad</Text>
        <AppButton title="Eliminar mi cuenta" onPress={borrarCuenta} variant="ghost" />
      </View>
      <Text style={styles.version}>Version v0.1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
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
  verifyRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.background, minHeight: theme.touch, paddingHorizontal: theme.spacing.md, fontSize: theme.type.body, color: theme.colors.text },
});
