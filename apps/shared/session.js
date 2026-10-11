// Sesion compartida por las dos apps: arranque, cierre y renovacion.
// Regla clave: un error de RED no destruye la sesion (solo un 401 real lo hace).
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, setAuthToken, clearAuthToken, setOnUnauthorized } from './api.js';
import { authStore } from './auth.js';

/**
 * @param {object} opciones
 * @param {string[]} [opciones.roles] roles permitidos para entrar a la app.
 * @returns {{estado:string, user:object|null, sinConexion:boolean, login:Function, logout:Function, reintentar:Function}}
 */
export function useSession({ roles } = {}) {
  const [estado, setEstado] = useState('cargando'); // cargando | login | app
  const [user, setUser] = useState(null);
  const [sinConexion, setSinConexion] = useState(false);
  const refRoles = useRef(roles);
  refRoles.current = roles;

  const cerrarSesionLocal = useCallback(async () => {
    try {
      const refreshToken = await authStore.getRefreshToken();
      if (refreshToken) api.logout(refreshToken).catch(() => {});
    } catch (e) {
      /* sin red: la sesion local se limpia igual */
    }
    try {
      await authStore.clearSession();
    } catch (e) {
      /* storage roto: igual se limpia el estado en memoria */
    }
    clearAuthToken();
    setUser(null);
    setEstado('login');
  }, []);

  const bootstrap = useCallback(async () => {
    setSinConexion(false);
    try {
      const token = await authStore.getToken();
      const savedUser = await authStore.getUser();
      if (!token || !savedUser) {
        setEstado('login');
        return;
      }
      setAuthToken(token);
      try {
        const r = await api.me();
        const u = r?.user ?? null;
        const permitidos = refRoles.current;
        if (!u || (permitidos && permitidos.length && !permitidos.includes(u.rol))) {
          await cerrarSesionLocal();
          return;
        }
        setUser(u);
        setEstado('app');
      } catch (e) {
        // 401 real -> la sesion ya no vale: se limpia.
        // Cualquier otro error (sin red, timeout, 500) -> se CONSERVA la sesion
        // y se avisa que no hay conexion.
        if (e?.status === 401) {
          await cerrarSesionLocal();
          return;
        }
        setUser(savedUser);
        setEstado('app');
        setSinConexion(true);
      }
    } catch (e) {
      setEstado('login');
    }
  }, [cerrarSesionLocal]);

  useEffect(() => {
    // El callback se guarda en un ref para no depender del render que lo creo.
    const ref = { fn: null };
    ref.fn = () => { cerrarSesionLocal(); };
    setOnUnauthorized(() => ref.fn());
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (token, refreshToken, nextUser) => {
    await authStore.saveSession(token, refreshToken, nextUser);
    setAuthToken(token);
    setUser(nextUser);
    setSinConexion(false);
    setEstado('app');
  }, []);

  const logout = useCallback(async () => {
    await cerrarSesionLocal();
  }, [cerrarSesionLocal]);

  return { estado, user, sinConexion, login, logout, reintentar: bootstrap };
}
