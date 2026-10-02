// Primitivas UI reutilizables (F4). Táctil 48, foco visible, errores con icono+texto (no solo color).
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

export function AppInput({ label, value, onChangeText, placeholder, secure, keyboard, autoCap }) {
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
      <Text style={styles.errorText}>⚠ {message}</Text>
    </View>
  );
}

// Badge de prioridad/estado: color + texto (nunca solo color, por accesibilidad).
export function Badge({ text, color }) {
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>● {text}</Text>
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

const styles = StyleSheet.create({
  btn: { minHeight: theme.touch, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.md },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
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
  error: { backgroundColor: '#FDECEC', borderWidth: 1, borderColor: theme.colors.critical, borderRadius: theme.radius.md, padding: theme.spacing.sm },
  errorText: { color: theme.colors.critical, fontSize: theme.type.caption },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: theme.type.caption, fontWeight: 'bold' },
  empty: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center' },
  emptyTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  emptyHint: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
  loadingRow: { padding: theme.spacing.lg, alignItems: 'center' },
});
