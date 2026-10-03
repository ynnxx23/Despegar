// Registro viajero: crea rol viajero (el backend lo impone aunque se manipule el cliente).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, ErrorBanner } from '../../shared/components';

export function RegisterScreen({ onSuccess, goLogin }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    if (nombre.trim().length < 2) { setError('Ingresa tu nombre (mínimo 2 letras).'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Ingresa un email válido.'); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setLoading(true);
    try {
      const r = await api.register(nombre.trim(), email.trim().toLowerCase(), password);
      onSuccess(r.token, r.user);
    } catch (e) {
      setError(e.status === 409 ? 'Ese email ya está registrado. Intenta ingresar.' : e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Crear cuenta</Text>
      <Text style={styles.sub}>Solo crea cuentas de viajero. Las cuentas de agente las da el equipo.</Text>
      <ErrorBanner message={error} />
      <AppInput label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Ana Viajera" />
      <AppInput label="Email" value={email} onChangeText={setEmail} placeholder="ana@test.com" keyboard="email-address" autoCap="none" />
      <AppInput label="Contraseña (mín. 8)" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secure autoCap="none" />
      <AppButton title="Registrarme" onPress={submit} loading={loading} />
      <AppButton title="Ya tengo cuenta" onPress={goLogin} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
});
