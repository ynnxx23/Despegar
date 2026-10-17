// Polling notificaciones no leídas (Fase 4b). SSE real queda para web;
// en móvil polling 30s alcanza y gasta poca batería.
import { useCallback, useEffect, useState } from 'react';

export function useNoLeidas(api, cadaMs = 30000) {
  const [n, setN] = useState(0);
  const contar = useCallback(async () => {
    try {
      const r = await api.get('/notificaciones/no-leidas');
      setN(r?.data?.no_leidas ?? 0);
    } catch (e) { /* sin red: conserva último */ }
  }, [api]);
  useEffect(() => {
    contar();
    const t = setInterval(contar, cadaMs);
    return () => clearInterval(t);
  }, [contar, cadaMs]);
  return [n, contar];
}
