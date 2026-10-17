// Cola offline reportes (Fase 4b): si POST /incidentes falla por red, se encola
// con su idempotencia_key y se reintenta al volver Reportar o con reintentar.
import { authStore } from './auth';

const MEM = { items: [] };

async function leer() {
  try {
    const raw = await authStore.getOfflineQueue?.();
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage opcional */ }
  return MEM.items;
}

async function guardar(items) {
  MEM.items = items;
  try {
    await authStore.setOfflineQueue?.(JSON.stringify(items));
  } catch (e) { /* memoria alcanza */ }
}

export async function encolarReporte(payload) {
  const items = await leer();
  items.push({ ...payload, _ts: Date.now() });
  await guardar(items);
  return items.length;
}

export async function pendientes() {
  return leer();
}

export async function sincronizar(api) {
  const items = await leer();
  const ok = [];
  const resto = [];
  for (const it of items) {
    try {
      const r = await api.post('/incidentes', {
        tipo: it.tipo,
        titulo: it.titulo,
        descripcion: it.descripcion,
        ...(it.reserva_id ? { reserva_id: it.reserva_id } : {}),
        idempotencia_key: it.idempotencia_key,
      });
      ok.push(r?.data?.id ?? null);
    } catch (e) {
      resto.push(it);
    }
  }
  await guardar(resto);
  return { enviados: ok, pendientes: resto.length };
}
