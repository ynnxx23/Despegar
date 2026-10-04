// Cliente HTTP compartido F4: adjunta Bearer automáticamente y
// notifica 401 (token inválido/expirado) para forzar logout (HCI: visibilidad de estado).
// Sin Axios: fetch alcanza y evita una dependencia (decisión plan §3).
// URL de la API: Expo incrusta EXPO_PUBLIC_API_URL al compilar el bundle.
// Cada PC crea apps/viajero/.env y apps/agente/.env (gitignored) con su IP LAN,
// ej. EXPO_PUBLIC_API_URL=http://192.168.1.10:8000/api
// (ipconfig -> IPv4). En emulador Android usa 'http://10.0.2.2:8000/api'.
// Sin variable cae a localhost (solo sirve en web).
const BASE_URL = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_API_URL) || 'http://localhost:8000/api';

let memoryToken = null;
let onUnauthorized = null;

export function setAuthToken(t) { memoryToken = t; }
export function clearAuthToken() { memoryToken = null; }
export function setOnUnauthorized(cb) { onUnauthorized = cb; }

async function request(path, options = {}) {
  const token = options.token || memoryToken;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
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
  health: () => request('/health', { method: 'GET' }),
  register: (nombre, email, password) =>
    request('/register', { method: 'POST', body: JSON.stringify({ nombre, email, password }) }),
  login: (email, password) =>
    request('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/me', { method: 'GET' }),
};
