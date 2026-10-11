// Gestion del caso: carga los datos y coordina las acciones (reclamar, seguir, derivar, responder).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../shared/theme';
import { api } from '../../shared/api';
import { AppButton, Badge, EmptyState, ErrorBanner, FormScrollView } from '../../shared/components';
import { etiquetaEstado } from '../../shared/format';
import { styles } from '../components/estilosGestion';
import { PanelAccion, PanelHistorial, PanelRespuesta, PanelTriaje, PanelViajero, ResumenCaso } from '../components/panelesGestion';

// Carga el caso y sus datos relacionados.
function useCaso(id) {
  const [inc, setInc] = useState(null);
  const [viajero, setViajero] = useState(null);
  const [reserva, setReserva] = useState(null);
  const [asignado, setAsignado] = useState(null);
  const [seguidores, setSeguidores] = useState([]);
  const [siguiendoApi, setSiguiendoApi] = useState(null);
  const [yo, setYo] = useState(null);
  const [hilo, setHilo] = useState([]);
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    setError('');
    try {
      const r = await api.get(`/admin/incidentes/${id}`);
      const payload = r?.data ?? {};
      const incidente = payload?.incidente ?? payload;
      setInc(incidente ?? null);
      setViajero(payload?.usuario ?? null);
      setReserva(payload?.reserva ?? null);
      setAsignado(payload?.asignado ?? null);
      const segs = payload?.seguidores ?? [];
      setSeguidores(Array.isArray(segs) ? segs : []);
      setSiguiendoApi(typeof payload?.siguiendo === 'boolean' ? payload.siguiendo : null);
    } catch (e) {
      setError(e?.message ?? 'No se pudo cargar el caso.');
    }

    try {
      const r = await api.get(`/admin/incidentes/${id}/respuestas`);
      setHilo(r?.data ?? []);
    } catch (e) { /* el hilo es opcional */ }

    try {
      const r = await api.get(`/admin/incidentes/${id}/historial`);
      const lista = r?.data ?? r?.historial ?? [];
      setHistorial(Array.isArray(lista) ? lista : []);
    } catch (e) {
      setHistorial(null);
    }

    try {
      const r = await api.me();
      setYo(r?.user ?? r?.data?.user ?? null);
    } catch (e) { /* el usuario es opcional */ }
  }, [id]);

  useEffect(() => { recargar(); }, [recargar]);

  // El backend es la fuente de verdad; la lista de seguidores sirve de respaldo.
  const siguiendoPorLista = yo?.id != null
    && seguidores.some((s) => String(s?.id) === String(yo.id));
  const siguiendo = siguiendoApi ?? siguiendoPorLista;

  return {
    inc, viajero, reserva, asignado, seguidores, siguiendo, yo, hilo, historial, error,
    recargar,
    setInc, setHilo, setHistorial, setSeguidores, setSiguiendo: setSiguiendoApi, setError,
  };
}

export function DetalleGestionScreen({ id, onBack, onChange }) {
  const insets = useSafeAreaInsets();
  const caso = useCaso(id);

  const [agentes, setAgentes] = useState([]);
  const [derivando, setDerivando] = useState(false);
  const [agenteElegido, setAgenteElegido] = useState(null);
  const [motivoDerivar, setMotivoDerivar] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [avisoPrioridad, setAvisoPrioridad] = useState(false);
  const [savingPut, setSavingPut] = useState(false);
  const [savingAccion, setSavingAccion] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [estadoPendiente, setEstadoPendiente] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  const { inc, viajero, reserva, asignado, siguiendo, yo, hilo, historial } = caso;

  async function refrescar() {
    setRefrescando(true);
    await caso.recargar();
    setRefrescando(false);
  }

  function marcarCambio() {
    if (!dirty) setDirty(true);
    try { onChange?.(true); } catch (e) { /* callback opcional */ }
  }

  function volver() {
    try { onBack?.(dirty); } catch (e) { /* navegación opcional */ }
  }

  async function put(parche) {
    caso.setError('');
    setAvisoPrioridad(false);
    setSavingPut(true);
    try {
      const r = await api.put(`/admin/incidentes/${id}`, parche);
      const payload = r?.data ?? {};
      const incidente = payload?.incidente ?? payload;
      if (incidente?.id != null) caso.setInc(incidente);
      marcarCambio();
      // El historial tiene que reflejar el cambio recien hecho.
      await recargarHistorial();
      return true;
    } catch (e) {
      if (e?.status === 400 && /prioridad/i.test(e?.message ?? '')) setAvisoPrioridad(true);
      caso.setError(e?.message ?? 'No se pudo guardar el cambio.');
      return false;
    } finally {
      setSavingPut(false);
    }
  }

  async function recargarHistorial() {
    try {
      const r = await api.get(`/admin/incidentes/${id}/historial`);
      const lista = r?.data ?? [];
      caso.setHistorial(Array.isArray(lista) ? lista : []);
    } catch (e) { /* historial opcional */ }
  }

  async function reclamar() {
    Alert.alert('Reclamar caso', `Te asignás el caso #${inc?.id ?? id}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reclamar',
        onPress: async () => {
          setSavingAccion(true);
          try {
            await api.post(`/admin/incidentes/${id}/claim`, {});
            marcarCambio();
            await caso.recargar();
            await recargarHistorial();
          } catch (e) {
            caso.setError(e?.status === 409 ? 'Ya lo reclamó otro agente.' : (e?.message ?? 'No se pudo reclamar.'));
          } finally {
            setSavingAccion(false);
          }
        },
      },
    ]);
  }

  async function liberar() {
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
            await caso.recargar();
            await recargarHistorial();
          } catch (e) {
            caso.setError(e?.message ?? 'No se pudo liberar.');
          } finally {
            setSavingAccion(false);
          }
        },
      },
    ]);
  }

  async function alternarSeguir() {
    setSavingAccion(true);
    caso.setError('');
    try {
      if (siguiendo) {
        const r = await api.del(`/admin/incidentes/${id}/seguir`);
        caso.setSiguiendo(false);
        if (Array.isArray(r?.data?.seguidores)) caso.setSeguidores(r.data.seguidores);
      } else {
        const r = await api.post(`/admin/incidentes/${id}/seguir`, {});
        caso.setSiguiendo(true);
        if (Array.isArray(r?.data?.seguidores)) caso.setSeguidores(r.data.seguidores);
      }
      marcarCambio();
      await caso.recargar();
    } catch (e) {
      caso.setError(e?.message ?? 'No se pudo actualizar el seguimiento.');
    } finally {
      setSavingAccion(false);
    }
  }

  async function abrirDerivar() {
    setDerivando(true);
    try {
      const r = await api.get('/admin/agentes');
      const lista = r?.data ?? r?.agentes ?? [];
      setAgentes(Array.isArray(lista) ? lista : []);
    } catch (e) {
      setAgentes([]);
    }
  }

  function cerrarDerivacion() {
    setDerivando(false);
    setAgenteElegido(null);
    setMotivoDerivar('');
  }

  function confirmarDerivar() {
    if (agenteElegido == null) {
      caso.setError('Elegí un agente antes de confirmar la derivación.');
      return;
    }
    const elegido = agentes.find((a) => String(a?.id) === String(agenteElegido));
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
            cerrarDerivacion();
            marcarCambio();
            await caso.recargar();
            await recargarHistorial();
          } catch (e) {
            caso.setError(e?.status === 404 ? 'Ese agente no existe.' : (e?.message ?? 'No se pudo derivar.'));
          } finally {
            setSavingAccion(false);
          }
        },
      },
    ]);
  }

  function textoCierre() {
    if (inc?.tipo === 'Fraude' || inc?.tipo === 'Otro') {
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

  function pedirCambioEstado(estado) {
    if (!inc || savingPut || estado === inc.estado) return;
    if (estado === 'Resuelto') { cerrar(); return; }
    if (inc.estado === 'Resuelto') { setEstadoPendiente(estado); return; }
    put({ estado });
  }

  function confirmarReapertura() {
    if (motivoReapertura.trim().length < 3) {
      caso.setError('Contanos el motivo de la reapertura (mínimo 3 caracteres).');
      return;
    }
    Alert.alert(
      'Reabrir caso',
      `El caso pasa a ${etiquetaEstado(estadoPendiente)}. Avisale al viajero.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            // El motivo viaja al backend (queda en el historial del caso).
            const ok = await put({ estado: estadoPendiente, motivo: motivoReapertura.trim() });
            if (ok) {
              setEstadoPendiente(null);
              setMotivoReapertura('');
            }
          },
        },
      ]
    );
  }

  async function responder() {
    caso.setError('');
    const texto = mensaje.trim();
    if (texto.length < 2) { caso.setError('Escribí una respuesta de al menos 2 caracteres.'); return; }
    setSavingReply(true);
    try {
      const r = await api.post(`/admin/incidentes/${id}/respuestas`, { mensaje: texto });
      const nuevo = r?.data ?? null;
      setMensaje('');
      marcarCambio();
      if (nuevo?.id != null) {
        caso.setHilo((prev) => ([
          ...(prev ?? []),
          {
            id: nuevo.id,
            mensaje: nuevo.mensaje ?? texto,
            incidente_id: nuevo.incidente_id ?? id,
            creado_at: nuevo.creado_at ?? new Date().toISOString(),
            autor: nuevo.autor ?? yo?.nombre ?? 'Soporte',
            autor_rol: nuevo.autor_rol ?? 'agente',
          },
        ]));
      } else {
        await caso.recargar();
      }
    } catch (e) {
      caso.setError(e?.message ?? 'No se pudo enviar la respuesta.');
    } finally {
      setSavingReply(false);
    }
  }

  const asignadoId = asignado?.id ?? inc?.asignado?.id ?? inc?.asignado_id ?? null;
  const nombreAsignado = asignado?.nombre ?? inc?.asignado_nombre ?? null;
  const sinAsignar = asignadoId == null && !nombreAsignado;
  const esMio = asignadoId != null && yo?.id != null && String(asignadoId) === String(yo.id);
  const nombresSeguidores = caso.seguidores.map((s) => s?.nombre ?? `#${s?.id ?? '—'}`).filter(Boolean);
  const sugerida = inc?.prioridad_sugerida ?? null;
  const motivoSugerida = inc?.prioridad_motivo ?? null;

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
          <Badge text={etiquetaEstado(inc.estado)} color={theme.status?.[inc.estado] || theme.colors.muted} />
        )}
      </View>

      <FormScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.lg }]}
        bottomPadding={insets.bottom + theme.spacing.lg}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} colors={[theme.colors.primary]} />}
      >
        {avisoPrioridad && (
          <View style={styles.aviso} accessibilityRole="alert">
            <Text style={styles.avisoTexto}>Triá una prioridad antes de resolver.</Text>
          </View>
        )}
        <ErrorBanner message={caso.error} />
        {caso.error !== '' && <AppButton title="Reintentar" variant="ghost" onPress={caso.recargar} />}
        {!inc && caso.error === '' && <ActivityIndicator color={theme.colors.primary} />}
        {!inc && caso.error !== '' && (
          <EmptyState
            title="No se pudo cargar el caso"
            hint="Revisá tu conexión e intentá de nuevo."
            actionTitle="Reintentar"
            onAction={caso.recargar}
          />
        )}

        {inc && <ResumenCaso inc={inc} />}

        {inc && (
          <PanelAccion
            nombreAsignado={nombreAsignado}
            esMio={esMio}
            sinAsignar={sinAsignar}
            siguiendo={siguiendo}
            nombresSeguidores={nombresSeguidores}
            savingAccion={savingAccion}
            onReclamar={reclamar}
            onLiberar={liberar}
            onSeguir={alternarSeguir}
            derivacion={{
              abierto: derivando,
              agentes,
              elegido: agenteElegido,
              hayElegido: agenteElegido != null,
              motivo: motivoDerivar,
              onAbrir: abrirDerivar,
              onElegir: setAgenteElegido,
              onMotivo: setMotivoDerivar,
              onCancelar: cerrarDerivacion,
              onConfirmar: confirmarDerivar,
            }}
          />
        )}

        {inc && <PanelViajero viajero={viajero} reserva={reserva} />}

        {inc && (
          <PanelTriaje
            inc={inc}
            sugerida={sugerida}
            motivoSugerida={motivoSugerida}
            savingPut={savingPut}
            onPrioridad={(p) => put({ prioridad: p })}
            onEstado={pedirCambioEstado}
            reapertura={estadoPendiente === null ? null : {
              estado: estadoPendiente,
              motivo: motivoReapertura,
              onMotivo: setMotivoReapertura,
              onCancelar: () => { setEstadoPendiente(null); setMotivoReapertura(''); },
              onConfirmar: confirmarReapertura,
            }}
          />
        )}

        {inc && (
          <PanelRespuesta
            hilo={hilo}
            mensaje={mensaje}
            onMensaje={setMensaje}
            savingReply={savingReply}
            onResponder={responder}
            nombreViajero={viajero?.nombre ?? null}
          />
        )}

        {inc && <PanelHistorial historial={historial} />}
      </FormScrollView>
    </View>
  );
}

