// Etiquetas legibles para tipos de reserva e incidente (evita mostrar valores crudos).
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
export function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}
