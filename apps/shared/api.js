// Cliente HTTP compartido: adjunta el Bearer, corta cada request a los 8s y avisa
// los 401 (token invalido/expirado) para forzar el logout. Sin Axios: fetch alcanza.
// La URL sale de EXPO_PUBLIC_API_URL, que Expo incrusta al compilar el bundle
// (apps/<app>/.env, gitignored). Sin la variable cae a localhost (solo web).
const BASE_URL = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_API_URL) || 'http://localhost:8000/api';

// Host (sin esquema ni /api) por si hay que depurar la configuracion.
export const API_HOST = String(BASE_URL).replace(/^https?:\/\//, '').split('/')[0] || 'localhost';

// RN no aplica timeout por defecto: sin esto un paquete descartado deja la UI
// colgada para siempre.
const TIMEOUT_MS = 8000;

let memoryToken = null;
let onUnauthorized = null;

export function setAuthToken(t) { memoryToken = t; }
export function clearAuthToken() { memoryToken = null; }
export function setOnUnauthorized(cb) { onUnauthorized = cb; }

async function request(path, options = {}) {
  const token = options.token || memoryToken;
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
  if (res.status === 401 && onUnauthorized) {
    try { await onUnauthorized(); } catch (e) { /* no rompe el flujo de error */ }
  }
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
  me: () => request('/me', { method: 'GET' }),
};
