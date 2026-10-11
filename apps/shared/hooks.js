// Hooks compartidos por las dos apps.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * Carga de una lista con refresco, error y estado de carga.
 * @param {Function} fn fn(): Promise<any> - la llamada a la API.
 * @param {any[]} deps dependencias que vuelven a disparar la carga.
 */
export function useApiList(fn, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  const cargar = useCallback(async ({ refresco = false } = {}) => {
    if (refresco) setRefrescando(true);
    else setCargando(true);
    setError('');
    try {
      const r = await fnRef.current();
      if (!montado.current) return null;
      setDatos(r);
      return r;
    } catch (e) {
      if (!montado.current) return null;
      setError(e?.message ?? 'No se pudo cargar la información.');
      return null;
    } finally {
      if (montado.current) {
        setCargando(false);
        setRefrescando(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { datos, error, cargando, refrescando, cargar, setDatos, setError };
}

/** Cuenta simple hacia atrás (mm:ss) que se refresca sola. */
export function useContador(segundos = 30) {
  const [restante, setRestante] = useState(segundos);
  useEffect(() => {
    setRestante(segundos);
    const t = setInterval(() => {
      setRestante((v) => (v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [segundos]);
  return restante;
}

export { api };
