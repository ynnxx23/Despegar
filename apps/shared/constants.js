// Constantes únicas gestión incidentes. Elimina fallbacks duplicados en screens.
export const TIPOS_INCIDENTE_ORDEN = [
  'Vuelo_cancelado',
  'Vuelo_retrasado',
  'Hotel_sin_reserva',
  'Equipaje',
  'Cobro_indebido',
  'Fraude',
  'Otro',
];

export const PRIORIDADES = ['Baja', 'Alta', 'Critica'];
export const ESTADOS = ['Abierto', 'EnGestion', 'Resuelto'];

export const COLA_TABS = ['Activos', 'Sin triar', 'Míos', 'Resueltos'];
export const COLA_SORTS = [
  { id: 'urgencia', label: 'Urgentes' },
  { id: 'asc', label: 'Antiguos' },
  { id: 'desc', label: 'Recientes' },
];

export const PAGINACION = { LIMIT_DEFAULT: 20, LIMIT_MAX: 50 };
export const SLA_HORAS = { Critica: 4, Alta: 24, Baja: 72 };

export function etiquetaTipo(tipo, mapa) {
  if (mapa?.[tipo]) return mapa[tipo];
  return String(tipo ?? '—').replace(/_/g, ' ');
}

export function etiquetaPrioridad(p) {
  if (!p) return 'Sin triar';
  if (p === 'Critica') return 'Crítica';
  return p;
}
