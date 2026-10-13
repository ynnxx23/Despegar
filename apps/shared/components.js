// Primitivas UI estilo EVA Despegar: botón pill 24px bold, cards 8px, header blanco.
// Táctil 48, foco visible, errores con icono+texto (no solo color).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from './theme';

export function AppButton({ title, onPress, loading, variant }) {
  const primary = variant !== 'ghost';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.btn,
        primary ? styles.btnPrimary : styles.btnGhost,
        pressed && styles.pressed,
        loading && styles.disabled,
      ]}
    >
      <Text style={primary ? styles.btnText : styles.btnGhostText}>
        {loading ? 'Cargando…' : title}
      </Text>
    </Pressable>
  );
}

export function AppInput({ label, value, onChangeText, placeholder, secure, keyboard, autoCap, returnKey, onSubmit, noCorrect, maxLen, lines }) {
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={secure && hidden}
          keyboardType={keyboard || 'default'}
          autoCapitalize={autoCap || 'sentences'}
          autoCorrect={noCorrect ? false : undefined}
          returnKeyType={returnKey || undefined}
          onSubmitEditing={onSubmit || undefined}
          maxLength={maxLen || undefined}
          multiline={!!lines}
          numberOfLines={lines || undefined}
        />
        {secure && (
          <Pressable accessibilityRole="button" onPress={() => setHidden(!hidden)} style={styles.eye}>
            <Text style={styles.eyeText}>{hidden ? 'Ver' : 'Ocultar'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

// Badge de prioridad/estado: color + texto (nunca solo color, por accesibilidad).
export function Badge({ text, color }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ title, hint, actionTitle, onAction }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint && <Text style={styles.emptyHint}>{hint}</Text>}
      {actionTitle && <AppButton title={actionTitle} onPress={onAction} variant="ghost" />}
    </View>
  );
}

export function LoadingRow({ text }) {
  return (
    <View style={styles.loadingRow}>
      <Text style={styles.emptyHint}>{text || 'Cargando…'}</Text>
    </View>
  );
}

// Identidad Despegar: imagotipo D + wordmark minúscula bold. Sin assets externos.
export function DespegarLogo({ size = 36 }) {
  return (
    <View style={[styles.logoRow, { minHeight: size }]}>
      <View style={[styles.logoD, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.logoDText, { fontSize: size * 0.55 }]}>D</Text>
      </View>
      <Text style={styles.logoWord}>despegar</Text>
    </View>
  );
}

// Layout base pantalla: fondo + padding + gap estándar. Reduce estilos repetidos.
export function Screen({ children, padded = true }) {
  return <View style={[styles.screen, padded && styles.screenPad]}>{children}</View>;
}

export function Card({ children, highlight = false }) {
  return (
    <View style={[styles.card, highlight && styles.cardHighlight]}>{children}</View>
  );
}

// Chip seleccionable unificado (reemplaza opt/chip duplicados en screens).
export function Chip({ label, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: theme.touch, borderRadius: theme.radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnGhost: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.primary },
  btnText: { color: '#fff', fontSize: theme.type.body, fontWeight: 'bold' },
  btnGhostText: { color: theme.colors.primary, fontSize: theme.type.body, fontWeight: 'bold' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
  field: { gap: 6 },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.card },
  input: { flex: 1, minHeight: theme.touch, paddingHorizontal: theme.spacing.md, fontSize: theme.type.body, color: theme.colors.text },
  eye: { paddingHorizontal: theme.spacing.md, minHeight: theme.touch, justifyContent: 'center' },
  eyeText: { color: theme.colors.primary, fontWeight: 'bold' },
  error: { backgroundColor: theme.colors.dangerBg, borderWidth: 1, borderColor: theme.colors.critical, borderRadius: theme.radius.md, padding: theme.spacing.sm },
  errorText: { color: theme.colors.criticalDark, fontSize: theme.type.caption },
  badge: { borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: theme.type.caption, fontWeight: 'bold' },
  empty: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center' },
  emptyTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  emptyHint: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
  loadingRow: { padding: theme.spacing.lg, alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoD: { backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  logoDText: { color: '#fff', fontWeight: 'bold' },
  logoWord: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.primary, letterSpacing: -0.5 },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  screenPad: { padding: theme.spacing.md, gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: theme.spacing.sm },
  cardHighlight: { backgroundColor: theme.colors.surfaceHighlight, borderWidth: 1, borderColor: theme.colors.primary },
  chip: { minHeight: 44, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, paddingHorizontal: theme.spacing.md, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceHighlight },
  chipText: { color: theme.colors.muted, fontSize: theme.type.caption, fontWeight: 'bold' },
  chipTextActive: { color: theme.colors.primary },
});
