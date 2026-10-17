// Recuperar contraseña en 2 pasos (solicitar → código + nueva). Compartido ambas apps.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';
import { api } from './api';
import { AppButton, AppInput, ErrorBanner } from './components';

export function PasswordReset({ onVolver }) {
  const [paso, setPaso] = useState(1);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState(null);

  async function solicitar() {
    setError('');
    setMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Ingresá un email válido.'); return; }
    setLoading(true);
    try {
      const r = await api.post('/password/solicitar', { email: email.trim().toLowerCase() });
      if (r?.data?.token) setDevToken(r.data.token);
      setMsg('Si el email existe, te enviamos un código. Revisá tu casilla.');
      setPaso(2);
    } catch (e) {
      setError(e?.message ?? 'No pudimos enviar el código.');
    } finally {
      setLoading(false);
    }
  }

  async function restablecer() {
    setError('');
    setMsg('');
    if (codigo.trim() === '') { setError('Ingresá el código.'); return; }
    if (pass1.length < 8 || pass1.length > 72) { setError('La contraseña debe tener 8 a 72 caracteres.'); return; }
    if (pass1 !== pass2) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    try {
      await api.post('/password/restablecer', { token: codigo.trim(), password: pass1 });
      setMsg('Contraseña cambiada. Ya podés ingresar.');
      setPaso(3);
    } catch (e) {
      setError(e?.message ?? 'Código inválido o expirado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Recuperar contraseña</Text>
      <ErrorBanner message={error} />
      {msg !== '' && <Text style={styles.ok}>{msg}</Text>}
      {devToken && <Text style={styles.hint}>Código (dev): {devToken}</Text>}
      {paso === 1 && (
        <>
          <AppInput label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboard="email-address" autoCap="none" />
          <AppButton title="Enviar código" onPress={solicitar} loading={loading} />
        </>
      )}
      {paso === 2 && (
        <>
          <AppInput label="Código" value={codigo} onChangeText={setCodigo} placeholder="Código recibido" autoCap="none" />
          <AppInput label="Nueva contraseña" value={pass1} onChangeText={setPass1} placeholder="Mínimo 8 caracteres" secure autoCap="none" />
          <AppInput label="Repetir contraseña" value={pass2} onChangeText={setPass2} placeholder="Repetila" secure autoCap="none" />
          <AppButton title="Cambiar contraseña" onPress={restablecer} loading={loading} />
        </>
      )}
      <AppButton title={paso === 3 ? 'Volver a ingresar' : 'Volver'} onPress={onVolver} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: theme.spacing.md },
  title: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  ok: { color: theme.colors.success, fontSize: theme.type.caption, fontWeight: 'bold' },
  hint: { fontSize: theme.type.caption, color: theme.colors.muted },
});
