// Panel de administracion de usuarios (solo rol admin).
// Permite registrar agentes nuevos, promover a agente a un usuario ya registrado,
// cambiar roles, activar/desactivar cuentas, resetear contraseñas y ver el
// historial de cambios.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, AppInput, Badge, Chip, EmptyState, ErrorBanner, FormScrollView } from '../../shared/components';
import { etiquetaAccionAdmin, etiquetaRol, fmtFechaHora } from '../../shared/format';

const ROLES = ['viajero', 'agente', 'admin'];
const FILTROS = [{ id: '', label: 'Todos' }, { id: 'viajero', label: 'Viajeros' }, { id: 'agente', label: 'Agentes' }, { id: 'admin', label: 'Admins' }];
const LIMITE = 50;

function UsuarioCard({ u, onAbrir, yoId }) {
  const soyYo = yoId != null && String(u?.id) === String(yoId);
  return (
    <Pressable
      onPress={() => onAbrir(u)}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${u?.nombre ?? 'Usuario'}, ${etiquetaRol(u?.rol)}${u?.activo ? '' : ', desactivado'}`}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{u?.nombre ?? '—'}</Text>
        <Badge text={etiquetaRol(u?.rol)} color={u?.rol === 'admin' ? theme.colors.primary : (theme.priority?.[u?.rol] || theme.colors.muted)} label="Rol" />
      </View>
      <Text style={styles.muted}>{u?.email ?? '—'}</Text>
      <Text style={styles.muted}>
        {u?.incidentes ?? 0} incidentes · {u?.asignados ?? 0} asignados
        {u?.activo === false ? ' · desactivado' : ''}
        {soyYo ? ' · vos' : ''}
      </Text>
    </Pressable>
  );
}

export function AdminUsuariosScreen({ user, onChange }) {
  const insets = useSafeAreaInsets();
  const [usuarios, setUsuarios] = useState(null);
  const [total, setTotal] = useState(0);
  const [filtroRol, setFiltroRol] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [seleccion, setSeleccion] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [feed, setFeed] = useState(null);

  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'agente' });
  const [formError, setFormError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    setError('');
    setCargando(true);
    try {
      const p = new URLSearchParams({ limit: String(LIMITE) });
      if (filtroRol) p.set('rol', filtroRol);
      if (busqueda.trim()) p.set('q', busqueda.trim());
      const r = await api.get(`/admin/usuarios?${p.toString()}`);
      setUsuarios(Array.isArray(r?.data) ? r.data : []);
      setTotal(typeof r?.total === 'number' ? r.total : 0);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar la lista de usuarios.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [filtroRol, busqueda]);

  const cargarHistorial = useCallback(async (usuarioId) => {
    try {
      if (usuarioId) {
        const r = await api.get(`/admin/usuarios/${usuarioId}/historial`);
        setHistorial(Array.isArray(r?.data) ? r.data : []);
      } else {
        const r = await api.get('/admin/historial');
        setFeed(Array.isArray(r?.data) ? r.data : []);
      }
    } catch (e) {
      setHistorial(null);
      setFeed(null);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarHistorial(seleccion?.id ?? null); }, [seleccion, cargarHistorial]);

  async function refrescar() {
    setRefrescando(true);
    await Promise.all([cargar(), cargarHistorial(seleccion?.id ?? null)]);
    setRefrescando(false);
  }

  function abrirUsuario(u) {
    setSeleccion(u);
    setMotivo('');
  }

  async function aplicarCambio(cambio, mensaje) {
    if (!seleccion) return;
    setGuardando(true);
    setError('');
    try {
      const r = await api.put(`/admin/usuarios/${seleccion.id}`, cambio);
      setSeleccion(r?.data ?? { ...seleccion, ...cambio });
      setMotivo('');
      await cargar();
      await cargarHistorial(seleccion.id);
      try { onChange?.(); } catch (e) { /* callback opcional */ }
    } catch (e) {
      setError(e?.message ?? 'No se pudo aplicar el cambio.');
    } finally {
      setGuardando(false);
    }
  }

  function cambiarRol(rol) {
    if (!seleccion || rol === seleccion.rol) return;
    Alert.alert(
      'Cambiar rol',
      `¿Cambiar el rol de ${seleccion.nombre} a ${etiquetaRol(rol)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: () => aplicarCambio({ rol, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }),
        },
      ]
    );
  }

  function alternarActivo() {
    if (!seleccion) return;
    const nuevo = !seleccion.activo;
    Alert.alert(
      nuevo ? 'Activar cuenta' : 'Desactivar cuenta',
      nuevo
        ? `¿Activar la cuenta de ${seleccion.nombre}?`
        : `¿Desactivar la cuenta de ${seleccion.nombre}? No va a poder iniciar sesión.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: nuevo ? 'Activar' : 'Desactivar',
          style: nuevo ? 'default' : 'destructive',
          onPress: () => aplicarCambio({ activo: nuevo, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }),
        },
      ]
    );
  }

  async function registrar() {
    setFormError('');
    const nombre = form.nombre.trim();
    const email = form.email.trim().toLowerCase();
    if (nombre.length < 2) { setFormError('El nombre debe tener al menos 2 caracteres.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFormError('Escribí un email válido.'); return; }
    if (form.password.length < 8 || form.password.length > 72) {
      setFormError('La contraseña debe tener entre 8 y 72 caracteres.');
      return;
    }
    setGuardando(true);
    try {
      const r = await api.post('/admin/usuarios', {
        nombre,
        email,
        password: form.password,
        rol: form.rol,
      });
      setCreando(false);
      setForm({ nombre: '', email: '', password: '', rol: 'agente' });
      await cargar();
      setSeleccion(r?.data ?? null);
      await cargarHistorial(r?.data?.id ?? null);
    } catch (e) {
      setFormError(e?.message ?? 'No se pudo registrar el usuario.');
    } finally {
      setGuardando(false);
    }
  }

  // ---------- Detalle de un usuario ----------
  if (seleccion) {
    const soyYo = user?.id != null && String(seleccion.id) === String(user.id);
    return (
      <FormScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        bottomPadding={insets.bottom + theme.spacing.lg}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[theme.colors.primary]} />}
      >
        <Pressable
          onPress={() => setSeleccion(null)}
          style={styles.volver}
          accessibilityRole="button"
          accessibilityLabel="Volver a la lista de usuarios"
        >
          <Text style={styles.volverTexto}>← Usuarios</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{seleccion.nombre}</Text>
          <Text style={styles.muted}>{seleccion.email}</Text>
          <View style={styles.row}>
            <Badge text={etiquetaRol(seleccion.rol)} color={seleccion.rol === 'admin' ? theme.colors.primary : theme.colors.muted} label="Rol" />
            <Badge text={seleccion.activo ? 'Activo' : 'Desactivado'} color={seleccion.activo ? theme.colors.success : theme.colors.criticalText} label="Estado" />
          </View>
        </View>

        <ErrorBanner message={error} onRetry={refrescar} />

        <Text style={styles.label}>Cambiar rol</Text>
        <View style={styles.row}>
          {ROLES.map((r) => (
            <Chip
              key={r}
              label={etiquetaRol(r)}
              active={seleccion.rol === r}
              onPress={() => cambiarRol(r)}
              accessibilityLabel={`Cambiar el rol a ${etiquetaRol(r)}`}
            />
          ))}
        </View>

        <AppInput
          label="Motivo del cambio (opcional)"
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Ej. Ingreso al equipo de soporte"
          maxLen={300}
          lines={2}
        />

        <View style={styles.row}>
          <AppButton
            title={seleccion.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
            variant="ghost"
            onPress={alternarActivo}
            loading={guardando}
            disabled={soyYo}
            accessibilityLabel={soyYo ? 'No podés desactivar tu propia cuenta' : undefined}
          />
        </View>
        {soyYo ? <Text style={styles.muted}>No podés desactivar tu propia cuenta.</Text> : null}

        <Text style={styles.subtitle}>Historial de cambios</Text>
        {historial === null ? (
          <Text style={styles.muted}>Sin historial</Text>
        ) : historial.length === 0 ? (
          <Text style={styles.muted}>Este usuario todavía no tiene cambios registrados.</Text>
        ) : (
          <View style={styles.historial}>
            {historial.map((h) => (
              <View key={h?.id} style={styles.histRow}>
                <Text style={styles.body}>{etiquetaAccionAdmin(h?.accion)}</Text>
                {h?.valor_anterior || h?.valor_nuevo ? (
                  <Text style={styles.muted}>
                    {h?.valor_anterior ?? '—'} → {h?.valor_nuevo ?? '—'}
                  </Text>
                ) : null}
                {h?.detalle ? <Text style={styles.muted}>{h.detalle}</Text> : null}
                <Text style={styles.muted}>
                  {h?.actor_nombre ?? 'Sistema'} · {fmtFechaHora(h?.creado_at)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </FormScrollView>
    );
  }

  // ---------- Lista + alta ----------
  const header = (
    <View style={styles.headerCol}>
      <Text style={styles.title}>Usuarios ({total})</Text>
      <ErrorBanner message={error} onRetry={cargar} />

      <AppInput
        label="Buscar"
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Nombre o email"
        autoCap="none"
        noCorrect
        maxLen={120}
      />

      <View style={styles.row}>
        {FILTROS.map((f) => (
          <Chip
            key={f.id || 'todos'}
            label={f.label}
            active={filtroRol === f.id}
            onPress={() => setFiltroRol(f.id)}
            accessibilityLabel={`Filtrar por ${f.label}`}
          />
        ))}
      </View>

      <AppButton
        title={creando ? 'Cancelar alta' : 'Registrar usuario nuevo'}
        onPress={() => { setCreando((v) => !v); setFormError(''); }}
        variant={creando ? 'ghost' : undefined}
      />

      {creando && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Nuevo usuario</Text>
          <ErrorBanner message={formError} />
          <AppInput
            label="Nombre"
            value={form.nombre}
            onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
            placeholder="Nombre y apellido"
            maxLen={100}
          />
          <AppInput
            label="Email"
            value={form.email}
            onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="persona@despegar.com"
            keyboard="email-address"
            autoCap="none"
            noCorrect
            maxLen={160}
          />
          <AppInput
            label="Contraseña"
            value={form.password}
            onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
            placeholder="Mínimo 8 caracteres"
            secure
            autoCap="none"
            noCorrect
            maxLen={72}
          />
          <Text style={styles.label}>Rol</Text>
          <View style={styles.row}>
            {ROLES.map((r) => (
              <Chip
                key={r}
                label={etiquetaRol(r)}
                active={form.rol === r}
                onPress={() => setForm((f) => ({ ...f, rol: r }))}
                accessibilityLabel={`Asignar el rol ${etiquetaRol(r)}`}
              />
            ))}
          </View>
          <AppButton title="Registrar" onPress={registrar} loading={guardando} />
        </View>
      )}

      <Text style={styles.subtitle}>Cambios recientes</Text>
      {feed === null ? (
        <Text style={styles.muted}>Sin historial</Text>
      ) : feed.length === 0 ? (
        <Text style={styles.muted}>Todavía no hay cambios registrados.</Text>
      ) : (
        <View style={styles.historial}>
          {feed.slice(0, 8).map((h) => (
            <View key={h?.id} style={styles.histRow}>
              <Text style={styles.body}>
                {etiquetaAccionAdmin(h?.accion)} · {h?.usuario_nombre ?? h?.usuario_email ?? '—'}
              </Text>
              <Text style={styles.muted}>
                {h?.actor_nombre ?? 'Sistema'} · {fmtFechaHora(h?.creado_at)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {cargando && usuarios === null && <ActivityIndicator color={theme.colors.primary} />}
    </View>
  );

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
      data={usuarios ?? []}
      keyExtractor={(u) => String(u?.id)}
      renderItem={({ item }) => (
        <UsuarioCard u={item} onAbrir={abrirUsuario} yoId={user?.id} />
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={
        usuarios !== null && !cargando ? (
          <EmptyState title="Sin resultados" hint="No hay usuarios que coincidan con el filtro." />
        ) : null
      }
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[theme.colors.primary]} />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  headerCol: { gap: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: 'bold', color: theme.colors.text },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6, borderWidth: 1, borderColor: theme.colors.border },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  historial: { gap: theme.spacing.sm },
  histRow: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 2, borderWidth: 1, borderColor: theme.colors.border },
  volver: { minHeight: 44, justifyContent: 'center' },
  volverTexto: { color: theme.colors.primary, fontWeight: 'bold', fontSize: theme.type.subtitle },
});
