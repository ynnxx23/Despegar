// Cliente HTTP compartido: adjunta Bearer a todas las peticiones, renueva la
// sesion con el refresh token cuando el access token expira y avisa si la URL
// de la API no quedo configurada. Sin Axios: fetch alcanza y evita una dependencia.
// URL de la API: Expo incrusta EXPO_PUBLIC_API_URL al compilar el bundle.
// Cada PC crea apps/viajero/.env y apps/agente/.env (gitignored) con su IP LAN,
// ej. EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api
// (ipconfig -> IPv4). En emulador Android usa 'http://10.0.2.2:8000/api'.
import { authStore } from './auth.js';

const ENV_URL = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_API_URL) || '';
const BASE_URL = ENV_URL || 'http://localhost:8000/api';

export const API_URL_CONFIGURED = Boolean(ENV_URL);
export const API_HOST = String(BASE_URL).replace(/^https?:\/\//, '').split('/')[0] || 'localhost';
export const API_WARNING = API_URL_CONFIGURED
  ? null
  : `No configuraste EXPO_PUBLIC_API_URL: la app apunta a ${API_HOST}, que no sirve desde un celular.`;

// RN no aplica timeout por defecto: sin esto un paquete descartado deja la UI en
// "Conectando…" para siempre. Corta a los 8s y devuelve error legible.
const TIMEOUT_MS = 8000;

let memoryToken = null;
let onUnauthorized = null;
let refrescoEnCurso = null;

export function setAuthToken(t) { memoryToken = t; }
export function clearAuthToken() { memoryToken = null; }
export function setOnUnauthorized(cb) { onUnauthorized = cb; }

// Canjea el refresh token por un access token nuevo. Varias peticiones que
// expiran a la vez comparten un solo refresco.
async function refrescarAccessToken() {
  const refreshToken = await authStore.getRefreshToken();
  if (!refreshToken) return false;
  if (!refrescoEnCurso) {
    refrescoEnCurso = request('/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, { sinAuth: true })
      .then(async (r) => {
        await authStore.saveSession(r.token, r.refresh_token, r.user);
        setAuthToken(r.token);
        return true;
      })
      .catch(() => false)
      .finally(() => { refrescoEnCurso = null; });
  }
  return refrescoEnCurso;
}

// config.sinAuth: no manda Bearer, no refresca y no dispara onUnauthorized.
async function request(path, options = {}, config = {}) {
  const sinAuth = config.sinAuth === true;
  const token = sinAuth ? null : (options.token || memoryToken);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      ...(options.signal ? {} : controller ? { signal: controller.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    const abortado = e && (e.name === 'AbortError' || (controller && controller.signal && controller.signal.aborted));
    if (abortado) {
      const err = new Error('El servidor no respondió a tiempo. Revisá tu conexión e intentá de nuevo.');
      err.status = 0;
      err.timeout = true;
      throw err;
    }
    const err = new Error('No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
    err.status = 0;
    err.offline = true;
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (res.status === 401 && !sinAuth) {
    if (config.reintentar !== false && await refrescarAccessToken()) {
      return request(path, options, { ...config, reintentar: false });
    }
    if (onUnauthorized) {
      try { await onUnauthorized(); } catch (e) { /* no rompe el flujo de error */ }
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...(opts || {}), method: 'GET' }),
  post: (path, body, opts) =>
    request(path, { ...(opts || {}), method: 'POST', body: JSON.stringify(body) }),
  put: (path, body, opts) =>
    request(path, { ...(opts || {}), method: 'PUT', body: JSON.stringify(body) }),
  del: (path, opts) => request(path, { ...(opts || {}), method: 'DELETE' }),
  health: () => request('/health', { method: 'GET' }),
  register: (nombre, email, password) =>
    request('/register', { method: 'POST', body: JSON.stringify({ nombre, email, password }) }),
  login: (email, password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: (refreshToken) =>
    request('/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken || '' }) }, { sinAuth: true }),
  me: () => request('/me', { method: 'GET' }),
};
