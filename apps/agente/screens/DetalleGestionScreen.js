// Gestión del caso: ACCIÓN primero, viajero/reserva, triaje, responder/hilo, historial.
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, EmptyState, ErrorBanner } from '../../shared/components';
import { TIPO_INCIDENTE, TIPO_RESERVA, fmtFecha } from '../../shared/format';

const MAX_RESPUESTA = 2000;

function accionLegible(a) {
  const t = String(a ?? '');
  if (!t) return 'Movimiento';
  return t.replace(/_/g, ' ');
}

export function DetalleGestionScreen({ id, onBack, onChange }) {
  const insets = useSafeAreaInsets();
  const [inc, setInc] = useState(null);
  const [viajero, setViajero] = useState(null);
  const [reserva, setReserva] = useState(null);
  const [asignado, setAsignado] = useState(null);
  const [seguidores, setSeguidores] = useState([]);
  const [siguiendo, setSiguiendo] = useState(false);
  const [yo, setYo] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [historial, setHistorial] = useState(null);
  const [agentes, setAgentes] = useState([]);
  const [mostrarDerivar, setMostrarDerivar] = useState(false);
  const [agenteElegido, setAgenteElegido] = useState(null);
  const [motivoDerivar, setMotivoDerivar] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [avisoPrioridad, setAvisoPrioridad] = useState(false);
  const [savingPut, setSavingPut] = useState(false);
  const [savingAccion, setSavingAccion] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [estadoPendiente, setEstadoPendiente] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [iaInfo, setIaInfo] = useState(null);
  const [iaLoading, setIaLoading] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const a = await api.get(`/admin/incidentes/${id}`);
      const payload = a?.data ?? {};
      const incidente = payload?.incidente ?? payload;
      setInc(incidente ?? null);
      setViajero(payload?.usuario ?? null);
      setReserva(payload?.reserva ?? null);
      const asig = payload?.asignado
        ?? (incidente?.asignado ?? null)
        ?? (incidente?.asignado_nombre ? { id: incidente?.asignado_id ?? null, nombre: incidente.asignado_nombre } : null);
      setAsignado(asig);
      const segs = payload?.seguidores ?? incidente?.seguidores ?? [];
      setSeguidores(Array.isArray(segs) ? segs : []);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar el caso.');
    }
    try {
      const b = await api.get(`/admin/incidentes/${id}/respuestas`);
      setHilo(b?.data ?? []);
    } catch (e) { /* hilo opcional */ }
    try {
      const h = await api.get(`/admin/incidentes/${id}/historial`);
      const lista = h?.data ?? h?.historial ?? [];
      setHistorial(Array.isArray(lista) ? lista : []);
    } catch (e) { setHistorial(null); }
    try {
      const m = await api.me();
      const u = m?.user ?? m?.data?.user ?? null;
      setYo(u ?? null);
    } catch (e) { /* yo opcional */ }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const yoId = yo?.id ?? null;
    if (yoId == null) { setSiguiendo(false); return; }
    setSiguiendo((seguidores ?? []).some((s) => String(s?.id ?? '') === String(yoId)));
  }, [seguidores, yo]);

  function marcarCambio() {
    if (!dirty) setDirty(true);
    try { onChange?.(true); } catch (e) { /* callback opcional */ }
  }

  function volver() {
    try { onBack?.(dirty); } catch (e) { /* navegación opcional */ }
  }

  async function put(parche) {
    setError('');
    setAvisoPrioridad(false);
    setSavingPut(true);
    try {
      const r = await api.put(`/admin/incidentes/${id}`, parche);
      const payload = r?.data ?? {};
      const incidente = payload?.incidente ?? payload;
      if (incidente?.id != null) setInc(incidente);
      if (payload?.usuario !== undefined) setViajero(payload.usuario);
      if (payload?.reserva !== undefined) setReserva(payload.reserva);
      if (payload?.asignado !== undefined) setAsignado(payload.asignado);
      marcarCambio();
    } catch (e) {
      if (e?.status === 400 && /prioridad/i.test(e?.message ?? '')) {
        setAvisoPrioridad(true);
      }
      setError(e?.message ?? 'No se pudo guardar el cambio.');
    } finally {
      setSavingPut(false);
    }
  }

  async function recargarHistorial() {
    try {
      const h = await api.get(`/admin/incidentes/${id}/historial`);
      const lista = h?.data ?? [];
      setHistorial(Array.isArray(lista) ? lista : []);
    } catch (e) { /* historial opcional */ }
  }

  function reclamar() {
    Alert.alert('Reclamar caso', `Te asignás el caso #${inc?.id ?? id}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reclamar',
        onPress: async () => {
          setSavingAccion(true);
          try {
            await api.post(`/admin/incidentes/${id}/claim`, {});
            marcarCambio();
            await load();
            await recargarHistorial();
          } catch (e) {
            setError(e?.status === 409 ? 'Ya lo reclamó otro agente.' : (e?.message ?? 'No se pudo reclamar.'));
          } finally {
            setSavingAccion(false);
          }
        },
      },
    ]);
  }

  function liberar() {
    Alert.alert('Liberar caso', 'El caso vuelve a la cola sin asignar. Confirmás?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Liberar',
        style: 'destructive',
        onPress: async () => {
          setSavingAccion(true);
          try {
            await api.post(`/admin/incidentes/${id}/release`, {});
            marcarCambio();
            await load();
            await recargarHistorial();
          } catch (e) {
            setError(e?.message ?? 'No se pudo liberar.');
          } finally {
            setSavingAccion(false);
          }
        },
      },
    ]);
  }

  async function alternarSeguir() {
    setSavingAccion(true);
    try {
      if (siguiendo) {
        await api.post(`/admin/incidentes/${id}/seguir`, { _method: 'DELETE' }).catch(async () => {
          // Fallback si backend no soporta POST con _method: intenta DELETE directo vía fetch del api.
          await api.post(`/admin/incidentes/${id}/seguir/delete`, {});
        });
        setSiguiendo(false);
      } else {
        await api.post(`/admin/incidentes/${id}/seguir`, {});
        setSiguiendo(true);
      }
      marcarCambio();
      await load();
    } catch (e) {
      setError(e?.message ?? 'No se pudo actualizar el seguimiento.');
    } finally {
      setSavingAccion(false);
    }
  }

  async function abrirDerivar() {
    setMostrarDerivar(true);
    try {
      const r = await api.get('/admin/agentes');
      const lista = r?.data ?? r?.agentes ?? [];
      setAgentes(Array.isArray(lista) ? lista : []);
    } catch (e) {
      setAgentes([]);
    }
  }

  function confirmarDerivar() {
    if (agenteElegido == null) {
      setError('Elegí un agente para derivar.');
      return;
    }
    const elegido = (agentes ?? []).find((a) => String(a?.id) === String(agenteElegido));
    Alert.alert('Derivar caso', `Derivás el caso #${inc?.id ?? id} a ${elegido?.nombre ?? `#${agenteElegido}`}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Derivar',
        onPress: async () => {
          setSavingAccion(true);
          try {
            await api.post(`/admin/incidentes/${id}/derivar`, {
              agente_id: agenteElegido,
              ...(motivoDerivar.trim() ? { motivo: motivoDerivar.trim() } : {}),
            });
            setMostrarDerivar(false);
            setAgenteElegido(null);
            setMotivoDerivar('');
            marcarCambio();
            await load();
            await recargarHistorial();
          } catch (e) {
            setError(e?.status === 404 ? 'Ese agente no existe.' : (e?.message ?? 'No se pudo derivar.'));
          } finally {
            setSavingAccion(false);
          }
        },
      },
    ]);
  }

  function textoCierre() {
    const tipo = inc?.tipo;
    if (tipo === 'Fraude' || tipo === 'Otro') {
      return 'Confirma que el caso está resuelto para el viajero.';
    }
    return 'Confirma que ya hablaste con la aerolínea/hotel y el viajero fue atendido.';
  }

  function cerrar() {
    Alert.alert('Marcar resuelto', textoCierre(), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Resuelto', onPress: () => put({ estado: 'Resuelto' }) },
    ]);
  }

  function pedirCambioEstado(s) {
    if (!inc || savingPut) return;
    if (s === inc.estado) return;
    if (s === 'Resuelto') { cerrar(); return; }
    if (inc.estado === 'Resuelto') {
      setEstadoPendiente(s);
      return;
    }
    put({ estado: s });
  }

  function confirmarReapertura() {
    if (motivoReapertura.trim().length < 3) {
      setError('Contanos el motivo de la reapertura (mínimo 3 caracteres).');
      return;
    }
    Alert.alert(
      'Reabrir caso',
      `El caso pasa a ${estadoPendiente === 'EnGestion' ? 'En gestión' : estadoPendiente}. Avisale al viajero.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await put({ estado: estadoPendiente });
            setEstadoPendiente(null);
            setMotivoReapertura('');
          },
        },
      ]
    );
  }

  async function responder() {
    setError('');
    const texto = mensaje.trim();
    if (texto.length < 2) { setError('Escribí una respuesta de al menos 2 caracteres.'); return; }
    setSavingReply(true);
    try {
      const r = await api.post(`/admin/incidentes/${id}/respuestas`, { mensaje: texto });
      const nuevo = r?.data ?? null;
      setMensaje('');
      marcarCambio();
      if (nuevo?.id != null) {
        setHilo((prev) => ([
          ...(prev ?? []),
          {
            id: nuevo.id,
            mensaje: nuevo.mensaje ?? texto,
            incidente_id: nuevo.incidente_id ?? id,
            creado_at: nuevo.creado_at ?? new Date().toISOString(),
            autor: nuevo.autor ?? 'Soporte',
            autor_rol: nuevo.autor_rol ?? 'agente',
          },
        ]));
      } else {
        await load();
      }
    } catch (e) {
      setError(e?.message ?? 'No se pudo enviar la respuesta.');
    } finally {
      setSavingReply(false);
    }
  }

  const nombreViajero = viajero?.nombre ?? '—';
  function esDeAgente(m) {
    if (m?.autor_rol) return m.autor_rol === 'agente';
    if (nombreViajero !== '—') return m?.autor !== nombreViajero;
    return false;
  }

  const reservaLinea = reserva
    ? `${TIPO_RESERVA?.[reserva?.tipo] || reserva?.tipo || 'Reserva'} · ${reserva?.codigo ?? reserva?.id ?? '—'}`
    : null;
  const reservaRuta = reserva
    ? (reserva?.hotel ?? [reserva?.origen, reserva?.destino].filter(Boolean).join(' → ') ?? '')
    : '';

  const sinAsignar = (asignado?.id ?? inc?.asignado?.id ?? null) == null
    && !(asignado?.nombre ?? inc?.asignado?.nombre ?? asignadoNombreFallback());
  function asignadoNombreFallback() {
    return inc?.asignado_nombre ?? null;
  }
  const asignadoId = asignado?.id ?? inc?.asignado?.id ?? inc?.asignado_id ?? null;
  const esMio = asignadoId != null && yo?.id != null && String(asignadoId) === String(yo.id);
  const sugerida = inc?.prioridad_sugerida ?? inc?.sugerida ?? null;
  const motivoSugerida = inc?.prioridad_motivo ?? inc?.motivo_sugerida ?? null;
  const nombresSeguidores = (seguidores ?? []).map((s) => s?.nombre ?? `#${s?.id ?? '—'}`).filter(Boolean);

  return (
    <View style={styles.shell}>
      <View style={styles.sticky}>
        <Pressable
          onPress={volver}
          accessibilityRole="button"
          accessibilityLabel={`Volver a la cola, caso ${inc?.id ?? id}`}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← #{inc?.id ?? id}</Text>
        </Pressable>
        {inc?.estado && (
          <Badge text={inc.estado === 'EnGestion' ? 'En gestión' : inc.estado} color={theme.status?.[inc.estado] || theme.colors.muted} />
        )}
      </View>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
      >
        {avisoPrioridad && (
          <View style={styles.aviso} accessibilityRole="alert">
            <Text style={styles.avisoTexto}>Triá una prioridad antes de resolver.</Text>
          </View>
        )}
        <ErrorBanner message={error} />
        {error !== '' && (
          <AppButton title="Reintentar" variant="ghost" onPress={load} />
        )}
        {!inc && error === '' && <ActivityIndicator color={theme.colors.primary} />}
        {!inc && error !== '' && (
          <EmptyState title="No se pudo cargar el caso" hint="Revisá tu conexión e intentá de nuevo." actionTitle="Reintentar" onAction={load} />
        )}
        {inc && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>#{inc.id} · {inc.titulo}</Text>
            <View style={styles.row}>
              <Badge text={inc.estado} color={theme.status?.[inc.estado] || theme.colors.muted} />
              <Badge
                text={inc.prioridad ? `Prioridad ${inc.prioridad}` : 'Sin triar'}
                color={theme.priority?.[inc.prioridad] || theme.colors.muted}
              />
            </View>
            <Text style={styles.muted}>{TIPO_INCIDENTE?.[inc.tipo] || inc.tipo} · {fmtFecha(inc.creado_at)}</Text>
            <Text style={styles.body}>{inc.descripcion}</Text>
          </View>
        )}
        {inc && (
          <View style={styles.card}>
            <Text style={styles.subtitle}>Acción</Text>
            {sinAsignar ? (
              <AppButton title={savingAccion ? 'Cargando…' : 'Reclamar caso'} onPress={reclamar} />
            ) : (
              <View style={styles.row}>
                {esMio && (
                  <>
                    <Pressable
                      onPress={liberar}
                      style={styles.secBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Liberar caso ${inc?.id ?? id}`}
                    >
                      <Text style={styles.secTexto}>Liberar</Text>
                    </Pressable>
                    <Pressable
                      onPress={abrirDerivar}
                      style={styles.secBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Derivar caso"
                    >
                      <Text style={styles.secTexto}>Derivar</Text>
                    </Pressable>
                  </>
                )}
                {!esMio && (
                  <Text style={styles.muted}>
                    Asignado a {asignado?.nombre ?? inc?.asignado?.nombre ?? asignadoNombreFallback() ?? 'otro agente'}
                  </Text>
                )}
              </View>
            )}
            <Pressable
              onPress={alternarSeguir}
              style={styles.secBtn}
              accessibilityRole="button"
              accessibilityLabel={siguiendo ? 'Dejar de seguir caso' : 'Seguir caso'}
            >
              <Text style={styles.secTexto}>{siguiendo ? 'Dejar de seguir' : 'Seguir'}</Text>
            </Pressable>
            {nombresSeguidores.length > 0 && (
              <Text style={styles.muted}>Siguen: {nombresSeguidores.join(', ')}</Text>
            )}
            {mostrarDerivar && (
              <View style={styles.derivarBox}>
                <Text style={styles.body}>Elegí agente y confirmá.</Text>
                {(agentes ?? []).length === 0 && (
                  <Text style={styles.muted}>Sin lista de agentes (revisá conexión).</Text>
                )}
                {(agentes ?? []).map((a) => (
                  <Pressable
                    key={a?.id}
                    onPress={() => setAgenteElegido(a?.id)}
                    style={[styles.chip, String(agenteElegido) === String(a?.id) && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Derivar a ${a?.nombre ?? a?.id}`}
                    accessibilityState={{ selected: String(agenteElegido) === String(a?.id) }}
                  >
                    <Text style={[styles.chipText, String(agenteElegido) === String(a?.id) && styles.chipTextActive]}>
                      {a?.nombre ?? `#${a?.id}`} {a?.email ? `· ${a.email}` : ''}
                    </Text>
                  </Pressable>
                ))}
                <TextInput
                  style={styles.area}
                  value={motivoDerivar}
                  onChangeText={(t) => setMotivoDerivar(t.slice(0, 500))}
                  placeholder="Motivo (opcional)"
                  placeholderTextColor={theme.colors.muted}
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.row}>
                  <Pressable onPress={() => { setMostrarDerivar(false); setAgenteElegido(null); setMotivoDerivar(''); }} accessibilityRole="button" style={styles.linkBtn}>
                    <Text style={styles.link}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={confirmarDerivar} accessibilityRole="button" style={styles.linkBtn} accessibilityLabel="Confirmar derivación">
                    <Text style={styles.link}>Confirmar</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}
        {inc && (
          <View style={styles.card}>
            <Text style={styles.subtitle}>Viajero</Text>
            <Text style={styles.body}>{viajero?.nombre ?? '—'}</Text>
            <Text style={styles.muted}>{viajero?.email ?? '—'}</Text>
            <Text style={[styles.subtitle, styles.mt]}>Reserva</Text>
            {reserva ? (
              <>
                <Text style={styles.body}>{reservaLinea}</Text>
                {!!reservaRuta && <Text style={styles.muted}>{reservaRuta}</Text>}
              </>
            ) : (
              <Text style={styles.muted}>Sin reserva vinculada</Text>
            )}
          </View>
        )}
        {inc && (
          <>
            <Text style={styles.label}>Prioridad</Text>
            {sugerida && (
              <Text style={styles.muted}>Sugerida: {sugerida}{motivoSugerida ? ` · ${motivoSugerida}` : ' por tipo'}</Text>
            )}
            <View style={styles.row}>
              {['Baja', 'Alta', 'Critica'].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => put({ prioridad: p })}
                  disabled={savingPut || inc.prioridad === p}
                  style={[styles.chip, inc.prioridad === p && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Cambiar prioridad a ${p === 'Critica' ? 'Crítica' : p}`}
                  accessibilityState={{ selected: inc.prioridad === p }}
                >
                  <Text style={[styles.chipText, inc.prioridad === p && styles.chipTextActive]}>{p === 'Critica' ? 'Crítica' : p}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Estado</Text>
            <View style={styles.row}>
              {['Abierto', 'EnGestion', 'Resuelto'].map((s) => (
                <Pressable
                  key={s}
                  onPress={() => pedirCambioEstado(s)}
                  disabled={savingPut || inc.estado === s}
                  style={[styles.chip, inc.estado === s && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Cambiar estado a ${s === 'EnGestion' ? 'En gestión' : s}`}
                  accessibilityState={{ selected: inc.estado === s }}
                >
                  <Text style={[styles.chipText, inc.estado === s && styles.chipTextActive]}>{s === 'EnGestion' ? 'En gestión' : s}</Text>
                </Pressable>
              ))}
            </View>
            {estadoPendiente !== null && (
              <View style={styles.reopenBox}>
                <Text style={styles.body}>Reabrir como {estadoPendiente === 'EnGestion' ? 'En gestión' : estadoPendiente}. Escribí el motivo antes de confirmar.</Text>
                <TextInput
                  style={styles.area}
                  value={motivoReapertura}
                  onChangeText={(t) => setMotivoReapertura(t.slice(0, 500))}
                  placeholder="Ej. El viajero avisó que el problema sigue."
                  placeholderTextColor={theme.colors.muted}
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.row}>
                  <Pressable onPress={() => { setEstadoPendiente(null); setMotivoReapertura(''); }} accessibilityRole="button" style={styles.linkBtn}>
                    <Text style={styles.link}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={confirmarReapertura} accessibilityRole="button" style={styles.linkBtn}>
                    <Text style={styles.link}>Confirmar reapertura</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <Text style={styles.label}>Responder al viajero</Text>
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                style={styles.secBtn}
                onPress={async () => {
                  setIaLoading(true);
                  try {
                    const r = await api.get(`/admin/incidentes/${id}/ia`);
                    setIaInfo(r?.data ?? null);
                  } catch (e) {
                    setError(e?.message ?? 'No se pudo pedir sugerencia IA.');
                  } finally {
                    setIaLoading(false);
                  }
                }}
              >
                <Text style={styles.secTexto}>{iaLoading ? 'Analizando…' : 'Sugerir prioridad (IA)'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.secBtn}
                onPress={async () => {
                  try {
                    const r = await api.post(`/admin/incidentes/${id}/copiloto`, { tono: 'cercano' });
                    const txt = r?.data?.texto;
                    if (txt) setMensaje(txt.slice(0, MAX_RESPUESTA));
                  } catch (e) {
                    setError(e?.message ?? 'No se pudo pedir copiloto.');
                  }
                }}
              >
                <Text style={styles.secTexto}>Copiloto: redactar</Text>
              </Pressable>
            </View>
            {iaInfo && (
              <Text style={styles.muted}>
                IA {iaInfo.ia_score ?? ''} ({iaInfo.ia_nivel ?? iaInfo.sugerida ?? ''}): {iaInfo.ia_explica ?? iaInfo.motivo ?? ''}
              </Text>
            )}
            <TextInput
              style={styles.area} value={mensaje} onChangeText={(t) => setMensaje(t.slice(0, MAX_RESPUESTA))}
              placeholder="Ej. Hablamos con la aerolínea: reprogramado mañana 08:00." placeholderTextColor={theme.colors.muted}
              multiline numberOfLines={3} textAlignVertical="top" maxLength={MAX_RESPUESTA}
            />
            <Text style={styles.muted}>{mensaje.length}/{MAX_RESPUESTA}</Text>
            <AppButton title="Enviar respuesta" onPress={responder} loading={savingReply} />
            <Text style={styles.subtitle}>Hilo ({hilo.length})</Text>
            {hilo.map((m) => {
              const agente = esDeAgente(m);
              return (
                <View key={m?.id} style={[styles.threadRow, agente ? styles.rowRight : styles.rowLeft]}>
                  <View style={[styles.bubble, agente ? styles.bubbleAgente : styles.bubbleViajero]}>
                    <Text style={styles.muted}>{m?.autor ?? '—'} · {agente ? 'Agente' : 'Viajero'} · {fmtFecha(m?.creado_at)}</Text>
                    <Text style={styles.body}>{m?.mensaje}</Text>
                  </View>
                </View>
              );
            })}
            <Text style={styles.subtitle}>Historial</Text>
            {historial === null && <Text style={styles.muted}>Sin historial</Text>}
            {historial !== null && historial.length === 0 && <Text style={styles.muted}>Sin historial</Text>}
            {(historial ?? []).map((h, idx) => (
              <View key={h?.id ?? idx} style={styles.histRow}>
                <Text style={styles.body}>{accionLegible(h?.accion)}</Text>
                <Text style={styles.muted}>{h?.actor_nombre ?? '—'} · {fmtFecha(h?.creado_at)}</Text>
                {!!h?.detalle && <Text style={styles.muted}>{h.detalle}</Text>}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: theme.colors.background },
  sticky: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, backgroundColor: theme.colors.background, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { minHeight: 44, justifyContent: 'center' },
  backText: { color: theme.colors.primary, fontWeight: 'bold', fontSize: theme.type.subtitle },
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 6 },
  cardTitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  label: { fontSize: theme.type.caption, color: theme.colors.text, fontWeight: 'bold' },
  subtitle: { fontSize: theme.type.subtitle, fontWeight: 'bold', color: theme.colors.text },
  mt: { marginTop: theme.spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.md, minHeight: 44, justifyContent: 'center', backgroundColor: theme.colors.card, opacity: 1 },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#EBE5F5' },
  chipText: { color: theme.colors.text },
  chipTextActive: { color: theme.colors.primary, fontWeight: 'bold' },
  secBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, minHeight: 44, paddingHorizontal: theme.spacing.md, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.card },
  secTexto: { color: theme.colors.primary, fontWeight: 'bold' },
  body: { fontSize: theme.type.body, color: theme.colors.text },
  muted: { fontSize: theme.type.caption, color: theme.colors.muted },
  area: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.card, minHeight: 90, padding: theme.spacing.sm, fontSize: theme.type.body, color: theme.colors.text },
  threadRow: { flexDirection: 'row' },
  rowRight: { justifyContent: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '85%', borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 4 },
  bubbleAgente: { backgroundColor: '#EBE5F5', alignSelf: 'flex-end' },
  bubbleViajero: { backgroundColor: '#EDEFF3', alignSelf: 'flex-start' },
  reopenBox: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border },
  derivarBox: { gap: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing.md },
  histRow: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, padding: theme.spacing.md, gap: 2 },
  aviso: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: theme.colors.warning, borderRadius: theme.radius.md, padding: theme.spacing.sm },
  avisoTexto: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: 'bold' },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  link: { color: theme.colors.primary, fontWeight: 'bold' },
});
