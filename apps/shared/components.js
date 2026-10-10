// Primitivas UI reutilizables (F4). Táctil 48, foco visible, errores con icono+texto (no solo color).
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { theme } from './theme.js';
import { API_WARNING } from './api.js';

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

// Aviso de configuracion: la URL de la API quedo en localhost y no sirve
// desde un celular real.
export function ApiWarning() {
  if (!API_WARNING) return null;
  return (
    <View style={styles.warning} accessibilityRole="alert">
      <Text style={styles.warningText}>{API_WARNING}</Text>
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

// ScrollView para formularios: el input enfocado nunca queda tapado por el teclado.
// Mide la altura del teclado y la suma como padding, y scrollea al abrirse.
// En iOS suma KeyboardAvoidingView; en Android el padding hace el trabajo.
export function FormScrollView({ children, contentContainerStyle, style, bottomPadding = 0, ...rest }) {
  const scrollRef = useRef(null);
  const [kb, setKb] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) => {
      setKb(e?.endCoordinates?.height ?? 0);
    });
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);

  useEffect(() => {
    if (kb <= 0) return undefined;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollY + kb, animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [kb, scrollY]);

  const tecladoStyle = kb > 0 ? { paddingBottom: bottomPadding + kb } : null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        onScroll={(e) => setScrollY(e?.nativeEvent?.contentOffset?.y ?? 0)}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[contentContainerStyle, tecladoStyle]}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  warning: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: theme.colors.warning, borderRadius: theme.radius.md, padding: theme.spacing.sm },
  warningText: { color: theme.colors.text, fontSize: theme.type.caption },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: theme.type.caption, fontWeight: 'bold' },
  empty: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center' },
  emptyTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  emptyHint: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
  loadingRow: { padding: theme.spacing.lg, alignItems: 'center' },
});
