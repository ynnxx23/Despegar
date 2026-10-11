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
const ES_HTTP = /^http:\/\//i.test(BASE_URL);
const ES_LOCAL = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|localhost:)/i.test(API_HOST);
export const API_WARNING = !API_URL_CONFIGURED
  ? `No configuraste EXPO_PUBLIC_API_URL: la app apunta a ${API_HOST}, que no sirve desde un celular.`
  : (ES_HTTP && !ES_LOCAL
    ? `Atención: la API está en HTTP (${API_HOST}). El token viaja sin cifrar: usá HTTPS.`
    : null);

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

// Mensajes legibles por codigo HTTP (el backend devuelve un mensaje, pero
// si la respuesta no es JSON (proxy, 502) se muestra algo entendible).
function mensajeDeError(status, body) {
  const delBackend = body?.error?.message;
  if (delBackend) return delBackend;
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión venció. Volvé a entrar.';
  if (status === 403) return 'No tenés permiso para hacer eso.';
  if (status === 404) return 'No encontramos lo que buscabas.';
  if (status === 409) return 'Ese cambio choca con el estado actual.';
  if (status === 429) return 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
  if (status >= 500) return 'El servidor tiene un problema. Probá en un momento.';
  return `HTTP ${status}`;
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

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !sinAuth) {
    if (config.reintentar !== false && await refrescarAccessToken()) {
      return request(path, options, { ...config, reintentar: false });
    }
    // Sesion vencida de verdad: se avisa al usuario con un mensaje claro
    // (y no con un "HTTP 401" crudo).
    if (onUnauthorized) {
      try { await onUnauthorized(); } catch (e) { /* no rompe el flujo de error */ }
    }
    const err = new Error(data?.error?.message || 'Tu sesión venció. Volvé a entrar.');
    err.status = 401;
    err.sesionVencida = true;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(mensajeDeError(res.status, data));
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
