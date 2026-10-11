// Registro viajero: crea rol viajero (el backend lo impone aunque se manipule el cliente).
// Validación alineada con backend/src/Controllers/AuthController.php:
//   nombre 2 a 100 · email válido (máx. 160) · contraseña de 8 a 72 caracteres.
// El servidor NO exige mayúscula ni número: el cliente tampoco las exige.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, ApiWarning, ErrorBanner, FormScrollView } from '../../shared/components';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOMBRE_MIN = 2;
const NOMBRE_MAX = 100;
const EMAIL_MAX = 160;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

export function RegisterScreen({ onSuccess, goLogin }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [loading, setLoading] = useState(false);

  const largoOk = password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

  function filaRegla(ok, texto) {
    return (
      <View style={styles.regla}>
        <Text style={[styles.reglaSigno, ok && styles.reglaOk]}>{ok ? '✓' : '○'}</Text>
        <Text style={[styles.reglaTexto, ok && styles.reglaTextoOk]}>{texto}</Text>
      </View>
    );
  }

  // Devuelve los errores por campo; si hay alguno, el envío no se hace.
  function validar() {
    const errs = {};
    const n = nombre.trim();
    if (n.length < NOMBRE_MIN || n.length > NOMBRE_MAX) {
      errs.nombre = `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`;
    }
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) {
      errs.email = 'Ingresa un email válido (ej. nombre@ejemplo.com).';
    } else if (mail.length > EMAIL_MAX) {
      errs.email = `El email no puede superar los ${EMAIL_MAX} caracteres.`;
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      errs.password = `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`;
    }
    if (confirmar !== password) {
      errs.confirmar = 'Las contraseñas no coinciden.';
    }
    setErrores(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit() {
    setError('');
    if (!validar()) return;
    setLoading(true);
    try {
      const r = await api.register(nombre.trim(), email.trim().toLowerCase(), password);
      onSuccess(r.token, r.refresh_token, r.user);
    } catch (e) {
      setError(e?.status === 409 ? 'Ese email ya está registrado. Ingresá con tu cuenta.' : (e?.message ?? 'No se pudo crear la cuenta.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScrollView style={styles.flex} contentContainerStyle={styles.root} bottomPadding={theme.spacing.lg}>
      <Text style={styles.title}>Crear cuenta</Text>
      <Text style={styles.sub}>Solo crea cuentas de viajero. Las cuentas de agente las da el equipo.</Text>
      <ApiWarning />
      <ErrorBanner message={error} />
      <AppInput
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        placeholder="Tu nombre"
        autoCap="words"
        maxLen={NOMBRE_MAX}
        error={errores.nombre}
        required
      />
      <AppInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="ejemplo@ejemplo.com"
        keyboard="email-address"
        autoCap="none"
        noCorrect
        maxLen={EMAIL_MAX}
        error={errores.email}
        required
      />
      <AppInput
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Tu contraseña"
        secure
        autoCap="none"
        noCorrect
        maxLen={PASSWORD_MAX}
        error={errores.password}
        hint={`Entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`}
        required
      />
      <View style={styles.check}>
        {filaRegla(largoOk, `Entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres`)}
      </View>
      <AppInput
        label="Confirmar contraseña"
        value={confirmar}
        onChangeText={setConfirmar}
        placeholder="Repetí tu contraseña"
        secure
        autoCap="none"
        noCorrect
        maxLen={PASSWORD_MAX}
        error={errores.confirmar}
        required
      />
      {confirmar !== '' && !errores.confirmar && (
        <Text style={confirmar === password ? styles.coincideOk : styles.coincideFail}>
          {confirmar === password ? '✓ Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
        </Text>
      )}
      <AppButton title="Registrarme" onPress={submit} loading={loading} />
      <AppButton title="Ya tengo cuenta" onPress={goLogin} variant="ghost" />
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.background },
  root: { flexGrow: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg, justifyContent: 'center', gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: theme.type.caption, color: theme.colors.muted },
  check: { gap: 4 },
  regla: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  reglaSigno: { color: theme.colors.muted, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
  reglaOk: { color: theme.colors.success },
  reglaTexto: { fontSize: theme.type.caption, color: theme.colors.muted },
  reglaTextoOk: { color: theme.colors.text },
  coincideOk: { fontSize: theme.type.caption, color: theme.colors.success, fontWeight: 'bold' },
  coincideFail: { fontSize: theme.type.caption, color: theme.colors.criticalText, fontWeight: 'bold' },
});
