// Test del cliente HTTP de las apps (apps/shared/api.js + auth.js) con Node.
// node --test tests/api_client_refresh.test.mjs
//
// apps/shared no tiene package.json propio: los archivos se copian a un temporal
// con "type": "module" para que Node los importe como ESM (Metro los empaqueta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const compartido = join(raiz, 'apps', 'shared');

const temporal = mkdtempSync(join(tmpdir(), 'despegar-shared-'));
for (const archivo of ['api.js', 'auth.js']) {
  copyFileSync(join(compartido, archivo), join(temporal, archivo));
}
writeFileSync(join(temporal, 'package.json'), JSON.stringify({ type: 'module' }));

process.on('exit', () => rmSync(temporal, { recursive: true, force: true }));

// Cada test importa api.js con una query distinta para empezar con estado limpio.
// El auth.js se importa sin query: es el mismo modulo que usa api.js por dentro.
const urlAuth = pathToFileURL(join(temporal, 'auth.js')).href;
const urlApi = pathToFileURL(join(temporal, 'api.js')).href;

const { authStore } = await import(urlAuth);

let version = 0;
async function cargarApi() {
  version += 1;
  const mod = await import(urlApi + '?v=' + version);
  return {
    api: mod.api,
    setAuthToken: mod.setAuthToken,
    setOnUnauthorized: mod.setOnUnauthorized,
  };
}

function respuesta(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function sesionActiva(setAuthToken) {
  await authStore.clearSession();
  await authStore.saveSession('token-viejo', 'refresh-abc', { id: 1, nombre: 'Ana', rol: 'viajero' });
  setAuthToken('token-viejo');
}

test('401: refresca el token, reintenta la peticion y no cierra sesion', async () => {
  const { api, setAuthToken, setOnUnauthorized } = await cargarApi();
  await sesionActiva(setAuthToken);

  const llamadas = [];
  globalThis.fetch = async (url, opts) => {
    llamadas.push({ url, auth: opts.headers.Authorization });
    if (url.endsWith('/refresh')) {
      return respuesta(200, { token: 'token-nuevo', refresh_token: 'refresh-xyz', user: { id: 1 } });
    }
    if (opts.headers.Authorization === 'Bearer token-viejo') {
      return respuesta(401, { error: { code: 401, message: 'Token invalido o expirado' } });
    }
    return respuesta(200, { data: 'ok' });
  };

  let cerrada = false;
  setOnUnauthorized(async () => { cerrada = true; });

  const r = await api.get('/itinerario');

  assert.equal(r.data, 'ok');
  assert.equal(cerrada, false, 'no debe cerrar sesion si el refresh funciona');
  assert.equal(await authStore.getToken(), 'token-nuevo');
  assert.equal(await authStore.getRefreshToken(), 'refresh-xyz');
  assert.equal(llamadas.length, 3, 'peticion + refresh + reintento');
  assert.equal(llamadas[2].auth, 'Bearer token-nuevo', 'el reintento usa el token nuevo');
});

test('refresh invalido: cierra sesion y propaga el error', async () => {
  const { api, setAuthToken, setOnUnauthorized } = await cargarApi();
  await sesionActiva(setAuthToken);

  globalThis.fetch = async (url) => {
    if (url.endsWith('/refresh')) {
      return respuesta(401, { error: { code: 401, message: 'Refresh token invalido o expirado' } });
    }
    return respuesta(401, { error: { code: 401, message: 'Token invalido o expirado' } });
  };

  let cerrada = false;
  setOnUnauthorized(async () => { cerrada = true; });

  await assert.rejects(() => api.get('/itinerario'), /Token invalido o expirado/);
  assert.equal(cerrada, true, 'sin refresh valido hay que cerrar sesion');
});

test('todas las peticiones llevan el header Authorization', async () => {
  const { api, setAuthToken } = await cargarApi();
  await sesionActiva(setAuthToken);

  const autorizaciones = [];
  globalThis.fetch = async (url, opts) => {
    autorizaciones.push(opts.headers.Authorization);
    return respuesta(200, { data: [] });
  };

  await api.get('/itinerario');
  await api.post('/incidentes', { titulo: 'x' });
  await api.put('/admin/incidentes/1', { prioridad: 'Alta' });

  assert.deepEqual(autorizaciones, [
    'Bearer token-viejo',
    'Bearer token-viejo',
    'Bearer token-viejo',
  ]);
});

test('sin EXPO_PUBLIC_API_URL la app avisa que la URL no sirve desde un celular', async () => {
  const { API_URL_CONFIGURED, API_WARNING } = await import(urlApi + '?v=config');
  assert.equal(API_URL_CONFIGURED, false);
  assert.match(API_WARNING, /EXPO_PUBLIC_API_URL/);
});
