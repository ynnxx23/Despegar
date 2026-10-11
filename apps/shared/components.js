// Primitivas UI reutilizables. Táctil 48, foco visible, errores con icono+texto
// (nunca solo color) y roles de accesibilidad en los controles interactivos.
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { theme } from './theme.js';
import { API_WARNING } from './api.js';

export function AppButton({ title, onPress, loading, variant, disabled, accessibilityLabel }) {
  const primary = variant !== 'ghost';
  const inactivo = loading || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!inactivo, busy: !!loading }}
      onPress={inactivo ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        primary ? styles.btnPrimary : styles.btnGhost,
        pressed && styles.pressed,
        inactivo && styles.disabled,
      ]}
    >
      <Text style={primary ? styles.btnText : styles.btnGhostText}>
        {loading ? 'Cargando…' : title}
      </Text>
    </Pressable>
  );
}

export function AppInput({
  label, value, onChangeText, placeholder, secure, keyboard, autoCap, returnKey,
  onSubmit, noCorrect, maxLen, lines, error, hint, required,
}) {
  const [hidden, setHidden] = useState(!!secure);
  const largo = typeof value === 'string' ? value.length : 0;
  const limite = maxLen || null;
  const restantes = limite ? limite - largo : null;
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
        {limite ? (
          <Text
            style={[styles.contador, restantes !== null && restantes <= 10 && styles.contadorAlerta]}
            accessibilityLabel={`${largo} de ${limite} caracteres escritos`}
          >
            {largo}/{limite}
          </Text>
        ) : null}
      </View>
      <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
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
          maxLength={limite || undefined}
          multiline={!!lines}
          numberOfLines={lines || undefined}
          accessibilityLabel={label}
          accessibilityHint={hint}
          accessibilityState={{ disabled: false }}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Mostrar contraseña' : 'Ocultar contraseña'}
            accessibilityState={{ selected: !hidden }}
            onPress={() => setHidden(!hidden)}
            style={styles.eye}
          >
            <Text style={styles.eyeText}>{hidden ? 'Ver' : 'Ocultar'}</Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={styles.inputError} accessibilityRole="alert">{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Reintentar"
          style={styles.retryBtn}
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Aviso de configuracion: la URL de la API quedo en localhost y no sirve
// desde un celular real.
export function ApiWarning() {
  if (!API_WARNING) return null;
  return (
    <View style={styles.warning} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.warningText}>{API_WARNING}</Text>
    </View>
  );
}

// Badge de prioridad/estado: color + texto (nunca solo color, por accesibilidad).
export function Badge({ text, color, label }) {
  const contenido = text || '—';
  return (
    <View style={[styles.badge, { borderColor: color || theme.colors.muted }]}>
      <Text
        style={[styles.badgeText, { color: color || theme.colors.muted }]}
        accessibilityLabel={label ? `${label}: ${contenido}` : contenido}
      >
        {contenido}
      </Text>
    </View>
  );
}

export function EmptyState({ title, hint, actionTitle, onAction }) {
  return (
    <View style={styles.empty} accessibilityRole="summary">
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint && <Text style={styles.emptyHint}>{hint}</Text>}
      {actionTitle && <AppButton title={actionTitle} onPress={onAction} variant="ghost" />}
    </View>
  );
}

export function LoadingRow({ text }) {
  return (
    <View style={styles.loadingRow} accessibilityRole="progressbar" accessibilityLabel={text || 'Cargando'}>
      <Text style={styles.emptyHint}>{text || 'Cargando…'}</Text>
    </View>
  );
}

// Chip seleccionable (filtros y opciones): comunica el estado activo a TalkBack.
export function Chip({ label, active, onPress, accessibilityLabel }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ScrollView para formularios: el input enfocado nunca queda tapado por el teclado.
// El alto del teclado se aplica SOLO en Android (en iOS lo hace KeyboardAvoidingView),
// y la posicion de scroll se guarda en un ref para no re-renderizar en cada scroll.
export function FormScrollView({ children, contentContainerStyle, style, bottomPadding = 0, ...rest }) {
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const [kb, setKb] = useState(0);

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
      scrollRef.current?.scrollTo({ y: scrollY.current + kb, animated: true });
    }, 120);
    return () => clearTimeout(t);
  }, [kb]);

  const tecladoStyle = kb > 0 && Platform.OS !== 'ios' ? { paddingBottom: bottomPadding + kb } : null;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        onScroll={(e) => { scrollY.current = e?.nativeEvent?.contentOffset?.y ?? 0; }}
        scrollEventThrottle={64}
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
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  contador: { fontSize: theme.type.caption, color: theme.colors.muted },
  contadorAlerta: { color: theme.colors.criticalText, fontWeight: 'bold' },
  hint: { fontSize: theme.type.caption, color: theme.colors.muted },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.card },
  inputRowError: { borderColor: theme.colors.critical },
  input: { flex: 1, minHeight: theme.touch, paddingHorizontal: theme.spacing.md, fontSize: theme.type.body, color: theme.colors.text },
  inputError: { fontSize: theme.type.caption, color: theme.colors.criticalText, fontWeight: 'bold' },
  eye: { paddingHorizontal: theme.spacing.md, minHeight: theme.touch, justifyContent: 'center' },
  eyeText: { color: theme.colors.primary, fontWeight: 'bold' },
  error: { backgroundColor: '#FDECEC', borderWidth: 1, borderColor: theme.colors.critical, borderRadius: theme.radius.md, padding: theme.spacing.sm, gap: 4 },
  errorText: { color: theme.colors.criticalText, fontSize: theme.type.caption },
  retryBtn: { minHeight: 44, justifyContent: 'center' },
  retryText: { color: theme.colors.criticalText, fontSize: theme.type.caption, fontWeight: 'bold' },
  warning: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: theme.colors.warning, borderRadius: theme.radius.md, padding: theme.spacing.sm },
  warningText: { color: theme.colors.text, fontSize: theme.type.caption },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: theme.spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: theme.type.caption, fontWeight: 'bold' },
  empty: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.sm, alignItems: 'center' },
  emptyTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  emptyHint: { fontSize: theme.type.caption, color: theme.colors.muted, textAlign: 'center' },
  loadingRow: { padding: theme.spacing.lg, alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: theme.spacing.md, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, justifyContent: 'center' },
  chipActive: { backgroundColor: '#EDE7FB', borderColor: theme.colors.primary },
  chipText: { fontSize: theme.type.caption, color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
});
