// Etiquetas legibles y formato de fechas (evita mostrar valores crudos en la UI).
export const TIPO_RESERVA = { vuelo: 'Vuelo', hotel: 'Hotel' };

export const TIPO_INCIDENTE = {
  Vuelo_cancelado: 'Vuelo cancelado',
  Vuelo_retrasado: 'Vuelo retrasado',
  Hotel_sin_reserva: 'Hotel sin reserva',
  Equipaje: 'Equipaje perdido o dañado',
  Cobro_indebido: 'Cobro indebido',
  Fraude: 'Fraude o estafa',
  Otro: 'Otro',
};

export function etiquetaTipo(tipo) {
  return TIPO_INCIDENTE?.[tipo] ?? String(tipo ?? '—').replace(/_/g, ' ');
}

export function etiquetaEstado(estado) {
  return estado === 'EnGestion' ? 'En gestión' : estado;
}

export function etiquetaPrioridad(prioridad) {
  if (!prioridad) return 'Sin triar';
  return prioridad === 'Critica' ? 'Crítica' : prioridad;
}

// Nombre legible de una accion del historial (claim, dejar_seguir, ...).
export function accionLegible(accion) {
  const t = String(accion ?? '');
  return t ? t.replace(/_/g, ' ') : 'Movimiento';
}

export function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}
