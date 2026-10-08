// Paneles de la gestion de caso. Cada bloque es una seccion independiente de la pantalla.
import { Pressable, Text, TextInput, View } from 'react-native';
import { theme } from '../../shared/theme';
import { Badge, AppButton } from '../../shared/components';
import { TIPO_INCIDENTE, TIPO_RESERVA, accionLegible, etiquetaEstado, etiquetaPrioridad, fmtFecha } from '../../shared/format';
import { styles } from '../components/estilosGestion';

const MAX_RESPUESTA = 2000;
const MAX_MOTIVO = 500;
const PRIORIDADES = ['Baja', 'Alta', 'Critica'];
const ESTADOS = ['Abierto', 'EnGestion', 'Resuelto'];

function ResumenCaso({ inc }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>#{inc.id} · {inc.titulo}</Text>
      <View style={styles.row}>
        <Badge text={etiquetaEstado(inc.estado)} color={theme.status?.[inc.estado] || theme.colors.muted} />
        <Badge
          text={inc.prioridad ? `Prioridad ${etiquetaPrioridad(inc.prioridad)}` : 'Sin triar'}
          color={theme.priority?.[inc.prioridad] || theme.colors.muted}
        />
      </View>
      <Text style={styles.muted}>{TIPO_INCIDENTE?.[inc.tipo] || inc.tipo} · {fmtFecha(inc.creado_at)}</Text>
      <Text style={styles.body}>{inc.descripcion}</Text>
    </View>
  );
}

function PanelAccion({
  nombreAsignado, esMio, sinAsignar, siguiendo, nombresSeguidores, savingAccion,
  onReclamar, onLiberar, onSeguir, derivacion,
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Acción</Text>
      <View style={styles.asignadoBox}>
        <Text style={styles.muted}>
          {sinAsignar
            ? 'Nadie lo reclamó todavía'
            : esMio
              ? `Lo tenés vos${nombreAsignado ? ` (${nombreAsignado})` : ''}`
              : `Reclamado por ${nombreAsignado ?? 'otro agente'}`}
        </Text>
      </View>

      {sinAsignar ? (
        <AppButton title={savingAccion ? 'Cargando…' : 'Reclamar caso'} onPress={onReclamar} />
      ) : (
        esMio && (
          <View style={styles.row}>
            <BotonSecundario onPress={onLiberar} label="Liberar" />
            <BotonSecundario onPress={derivacion.onAbrir} label="Derivar" />
          </View>
        )
      )}

      <Pressable
        onPress={onSeguir}
        disabled={savingAccion}
        style={[styles.secBtn, siguiendo && styles.secBtnOn]}
        accessibilityRole="button"
        accessibilityLabel={siguiendo ? 'Dejar de seguir caso' : 'Seguir caso'}
      >
        <Text style={styles.secTexto}>{siguiendo ? 'Dejar de seguir' : 'Seguir'}</Text>
      </Pressable>
      <Text style={styles.muted}>
        {siguiendo
          ? 'Lo seguís: aparece en tu pestaña Siguiendo.'
          : 'Seguí el caso para verlo en tu pestaña Siguiendo. Puede seguirlo cualquiera, tenga o no el caso.'}
      </Text>
      {nombresSeguidores.length > 0 && (
        <Text style={styles.muted}>Siguen: {nombresSeguidores.join(', ')}</Text>
      )}

      {derivacion.abierto && (
        <View style={styles.derivarBox}>
          <Text style={styles.body}>Elegí agente y confirmá.</Text>
          {derivacion.agentes.length === 0 && (
            <Text style={styles.muted}>Sin lista de agentes (revisá conexión).</Text>
          )}
          {derivacion.agentes.map((a) => (
            <Pressable
              key={a?.id}
              onPress={() => derivacion.onElegir(a?.id)}
              style={[styles.chip, String(derivacion.elegido) === String(a?.id) && styles.chipActive]}
              accessibilityRole="button"
              accessibilityLabel={`Derivar a ${a?.nombre ?? a?.id}`}
              accessibilityState={{ selected: String(derivacion.elegido) === String(a?.id) }}
            >
              <Text style={[styles.chipText, String(derivacion.elegido) === String(a?.id) && styles.chipTextActive]}>
                {a?.nombre ?? `#${a?.id}`} {a?.email ? `· ${a.email}` : ''}
              </Text>
            </Pressable>
          ))}
          <TextInput
            style={styles.area}
            value={derivacion.motivo}
            onChangeText={(t) => derivacion.onMotivo(t.slice(0, MAX_MOTIVO))}
            placeholder="Motivo (opcional)"
            placeholderTextColor={theme.colors.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.row}>
            <BotonEnlace onPress={derivacion.onCancelar} label="Cancelar" />
            <BotonEnlace onPress={derivacion.onConfirmar} label="Confirmar" etiqueta="Confirmar derivación" />
          </View>
        </View>
      )}
    </View>
  );
}

function PanelViajero({ viajero, reserva }) {
  const linea = reserva
    ? `${TIPO_RESERVA?.[reserva?.tipo] || reserva?.tipo || 'Reserva'} · ${reserva?.codigo ?? reserva?.id ?? '—'}`
    : null;
  const ruta = reserva
    ? (reserva?.hotel ?? [reserva?.origen, reserva?.destino].filter(Boolean).join(' → ') ?? '')
    : '';

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>Viajero</Text>
      <Text style={styles.body}>{viajero?.nombre ?? '—'}</Text>
      <Text style={styles.muted}>{viajero?.email ?? '—'}</Text>

      <Text style={[styles.subtitle, styles.mt]}>Reserva</Text>
      {reserva ? (
        <>
          <Text style={styles.body}>{linea}</Text>
          {!!ruta && <Text style={styles.muted}>{ruta}</Text>}
        </>
      ) : (
        <Text style={styles.muted}>Sin reserva vinculada</Text>
      )}
    </View>
  );
}

function PanelTriaje({ inc, sugerida, motivoSugerida, savingPut, onPrioridad, onEstado, reapertura }) {
  return (
    <>
      <Text style={styles.label}>Prioridad</Text>
      {sugerida && (
        <Text style={styles.muted}>Sugerida: {sugerida}{motivoSugerida ? ` · ${motivoSugerida}` : ' por tipo'}</Text>
      )}
      <View style={styles.row}>
        {PRIORIDADES.map((p) => (
          <Pressable
            key={p}
            onPress={() => onPrioridad(p)}
            disabled={savingPut || inc.prioridad === p}
            style={[styles.chip, inc.prioridad === p && styles.chipActive]}
            accessibilityRole="button"
            accessibilityLabel={`Cambiar prioridad a ${etiquetaPrioridad(p)}`}
            accessibilityState={{ selected: inc.prioridad === p }}
          >
            <Text style={[styles.chipText, inc.prioridad === p && styles.chipTextActive]}>{etiquetaPrioridad(p)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Estado</Text>
      <View style={styles.row}>
        {ESTADOS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onEstado(s)}
            disabled={savingPut || inc.estado === s}
            style={[styles.chip, inc.estado === s && styles.chipActive]}
            accessibilityRole="button"
            accessibilityLabel={`Cambiar estado a ${etiquetaEstado(s)}`}
            accessibilityState={{ selected: inc.estado === s }}
          >
            <Text style={[styles.chipText, inc.estado === s && styles.chipTextActive]}>{etiquetaEstado(s)}</Text>
          </Pressable>
        ))}
      </View>

      {reapertura && (
        <View style={styles.reopenBox}>
          <Text style={styles.body}>
            Reabrir como {etiquetaEstado(reapertura.estado)}. Escribí el motivo antes de confirmar.
          </Text>
          <TextInput
            style={styles.area}
            value={reapertura.motivo}
            onChangeText={(t) => reapertura.onMotivo(t.slice(0, MAX_MOTIVO))}
            placeholder="Ej. El viajero avisó que el problema sigue."
            placeholderTextColor={theme.colors.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.row}>
            <BotonEnlace onPress={reapertura.onCancelar} label="Cancelar" />
            <BotonEnlace onPress={reapertura.onConfirmar} label="Confirmar reapertura" />
          </View>
        </View>
      )}
    </>
  );
}

function PanelRespuesta({ hilo, mensaje, onMensaje, savingReply, onResponder, nombreViajero }) {
  const esDeAgente = (m) => {
    if (m?.autor_rol) return m.autor_rol === 'agente';
    if (nombreViajero) return m?.autor !== nombreViajero;
    return false;
  };

  return (
    <>
      <Text style={styles.label}>Responder al viajero</Text>
      <TextInput
        style={styles.area}
        value={mensaje}
        onChangeText={(t) => onMensaje(t.slice(0, MAX_RESPUESTA))}
        placeholder="Ej. Hablamos con la aerolínea: reprogramado mañana 08:00."
        placeholderTextColor={theme.colors.muted}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={MAX_RESPUESTA}
      />
      <Text style={styles.muted}>{mensaje.length}/{MAX_RESPUESTA}</Text>
      <AppButton title="Enviar respuesta" onPress={onResponder} loading={savingReply} />

      <Text style={styles.subtitle}>Hilo ({hilo.length})</Text>
      {hilo.map((m) => {
        const delAgente = esDeAgente(m);
        return (
          <View key={m?.id} style={[styles.threadRow, delAgente ? styles.rowRight : styles.rowLeft]}>
            <View style={[styles.bubble, delAgente ? styles.bubbleAgente : styles.bubbleViajero]}>
              <Text style={styles.muted}>
                {m?.autor ?? '—'} · {delAgente ? 'Agente' : 'Viajero'} · {fmtFecha(m?.creado_at)}
              </Text>
              <Text style={styles.body}>{m?.mensaje}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
}

function PanelHistorial({ historial }) {
  return (
    <>
      <Text style={styles.subtitle}>Historial</Text>
      {(historial === null || historial.length === 0) && (
        <Text style={styles.muted}>Sin historial</Text>
      )}
      {(historial ?? []).map((h, idx) => (
        <View key={h?.id ?? idx} style={styles.histRow}>
          <Text style={styles.body}>{accionLegible(h?.accion)}</Text>
          <Text style={styles.muted}>{h?.actor_nombre ?? '—'} · {fmtFecha(h?.creado_at)}</Text>
          {!!h?.detalle && <Text style={styles.muted}>{h.detalle}</Text>}
        </View>
      ))}
    </>
  );
}

function BotonSecundario({ onPress, label }) {
  return (
    <Pressable onPress={onPress} style={styles.secBtn} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.secTexto}>{label}</Text>
    </Pressable>
  );
}

function BotonEnlace({ onPress, label, etiqueta }) {
  return (
    <Pressable onPress={onPress} style={styles.linkBtn} accessibilityRole="button" accessibilityLabel={etiqueta ?? label}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}
