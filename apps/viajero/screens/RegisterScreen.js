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
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reglaLargo = password.length >= 8;
  const reglaMayus = /[A-Z]/.test(password);
  const reglaNum = /[0-9]/.test(password);

  function filaRegla(ok, texto) {
    return (
      <View style={styles.regla}>
        <Text style={[styles.reglaSigno, ok && styles.reglaOk]}>{ok ? '✓' : '○'}</Text>
        <Text style={[styles.reglaTexto, ok && styles.reglaTextoOk]}>{texto}</Text>
      </View>
    );
  }

  async function submit() {
    setError('');
    if (nombre.trim().length < 2) { setError('Ingresa tu nombre (mínimo 2 letras).'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Ingresa un email válido.'); return; }
    if (!reglaLargo || !reglaMayus || !reglaNum) { setError('La contraseña no cumple las reglas.'); return; }
    if (confirmar !== password) { setError('Las contraseñas no coinciden.'); return; }
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
      <View style={styles.check}>
        {filaRegla(reglaLargo, 'Mínimo 8 caracteres')}
        {filaRegla(reglaMayus, 'Una mayúscula')}
        {filaRegla(reglaNum, 'Un número')}
      </View>
      <AppInput label="Confirmar contraseña" value={confirmar} onChangeText={setConfirmar} placeholder="Repetí tu contraseña" secure autoCap="none" />
      {confirmar !== '' && (
        <Text style={confirmar === password ? styles.coincideOk : styles.coincideFail}>
          {confirmar === password ? '✓ Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
        </Text>
      )}
      <AppButton title="Registrarme" onPress={submit} loading={loading} />
      <AppButton title="Ya tengo cuenta" onPress={goLogin} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  check: { gap: 4 },
  regla: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  reglaSigno: { color: theme.colors.muted, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  reglaOk: { color: theme.colors.success },
  reglaTexto: { fontSize: theme.type.caption, color: theme.colors.muted },
  reglaTextoOk: { color: theme.colors.text },
  coincideOk: { fontSize: theme.type.caption, color: theme.colors.success, fontWeight: 'bold' },
  coincideFail: { fontSize: theme.type.caption, color: theme.colors.critical },
});
