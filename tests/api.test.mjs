// Suite automatizada de la API contra el backend vivo (node:test + assert/strict, sin dependencias).
//   node --test tests/api.test.mjs
// Base configurable con la variable de entorno API_BASE (por defecto http://127.0.0.1:8000).
//
// Cada corrida usa correos unicos (sufijo aleatorio) para no chocar con los
// datos demo ni con las corridas de otros sobre el mismo repo.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const TIMEOUT_MS = 10000;

// Cuentas demo del seed (db/seed_demo.sql).
const ADMIN_DEMO = { email: 'admin@despegar.com', password: 'Admin1234' };
const AGENTE_DEMO = { email: 'agente@despegar.com', password: 'Agente123' };

// Sello unico por corrida: los correos no chocan con la BD ni entre corridas.
const SELLO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const EMAIL_VIAJERO = `viajero-${SELLO}@test.com`;
const EMAIL_ALTA = `alta-${SELLO}@test.com`;
const PASSWORD = 'Prueba1234';

// Sesiones compartidas entre tests (se arman en before).
const sesion = { viajero: null, admin: null, agente: null, idAlta: 0 };

// Llamada HTTP: devuelve status, headers y cuerpo JSON (o null si no vino JSON).
async function api(method, ruta, opciones = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (opciones.token) cabeceras.Authorization = `Bearer ${opciones.token}`;
  const respuesta = await fetch(`${API_BASE}${ruta}`, {
    method,
    headers: cabeceras,
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await respuesta.text();
  let cuerpo = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  return { status: respuesta.status, headers: respuesta.headers, cuerpo, texto };
}

// Error de la API: {error:{code,message}} (mismo formato para todos los endpoints).
function assertError(respuesta, code, contexto) {
  assert.equal(
    respuesta.status,
    code,
    `${contexto}: esperaba ${code} y vino ${respuesta.status} (${respuesta.texto})`
  );
  assert.ok(respuesta.cuerpo && respuesta.cuerpo.error, `${contexto}: la respuesta no trae error`);
  assert.equal(respuesta.cuerpo.error.code, code, `${contexto}: el codigo del cuerpo no coincide`);
  assert.equal(typeof respuesta.cuerpo.error.message, 'string', `${contexto}: falta el mensaje`);
}

before(async () => {
  // 1. La API tiene que estar levantada: si no, se avisa con el comando exacto.
  let vivo = false;
  try {
    const salud = await api('GET', '/api/health');
    vivo = salud.status === 200;
  } catch {
    vivo = false;
  }
  if (!vivo) {
    throw new Error(
      `La API no está disponible en ${API_BASE}; levantala con: php -S localhost:8000 -t backend/public`
    );
  }

  // 2. Viajero nuevo de esta corrida (registro publico: solo crea viajeros).
  const registro = await api('POST', '/api/register', {
    body: { nombre: 'Viajero de Prueba', email: EMAIL_VIAJERO, password: PASSWORD },
  });
  assert.equal(registro.status, 201, `el registro deberia dar 201 (${registro.texto})`);
  sesion.viajero = registro.cuerpo;

  // 3. Admin y agente del seed (el admin arma el panel de usuarios).
  const loginAdmin = await api('POST', '/api/login', { body: ADMIN_DEMO });
  assert.equal(loginAdmin.status, 200, `login admin: ${loginAdmin.texto}`);
  sesion.admin = loginAdmin.cuerpo;

  const loginAgente = await api('POST', '/api/login', { body: AGENTE_DEMO });
  assert.equal(loginAgente.status, 200, `login agente: ${loginAgente.texto}`);
  sesion.agente = loginAgente.cuerpo;
});

test('health: responde 200 y /api/v1 es alias de /api', async () => {
  const salud = await api('GET', '/api/health');
  assert.equal(salud.status, 200);
  assert.equal(salud.cuerpo.ok, true);
  assert.equal(salud.cuerpo.service, 'despegar-api');
  assert.ok(Array.isArray(salud.cuerpo.roles));

  const versionado = await api('GET', '/api/v1/health');
  assert.equal(versionado.status, 200, '/api/v1/health debe ser alias de /api/health');
  assert.equal(versionado.cuerpo.service, 'despegar-api');
});

test('register: alta de viajero 201 y email duplicado 409', async () => {
  const alta = await api('POST', '/api/register', {
    body: { nombre: 'Viajero Repetido', email: EMAIL_VIAJERO, password: PASSWORD },
  });
  assertError(alta, 409, 'register duplicado');

  // El registro publico siempre crea viajeros (los agentes los crea el admin).
  const nuevo = await api('POST', '/api/register', {
    body: {
      nombre: 'Segundo Viajero',
      email: `segundo-${SELLO}@test.com`,
      password: PASSWORD,
      rol: 'admin',
    },
  });
  assert.equal(nuevo.status, 201, `segundo registro: ${nuevo.texto}`);
  assert.equal(nuevo.cuerpo.user.rol, 'viajero', 'el registro publico no puede crear admins');
  assert.equal(typeof nuevo.cuerpo.token, 'string');
  assert.equal(typeof nuevo.cuerpo.refresh_token, 'string');
});

test('login: credenciales validas 200 e invalidas 401', async () => {
  const ok = await api('POST', '/api/login', { body: { email: EMAIL_VIAJERO, password: PASSWORD } });
  assert.equal(ok.status, 200, `login ok: ${ok.texto}`);
  assert.equal(ok.cuerpo.user.email, EMAIL_VIAJERO);
  assert.equal(ok.cuerpo.user.rol, 'viajero');
  assert.ok(ok.cuerpo.token && ok.cuerpo.token.split('.').length === 3, 'el token es un JWT');
  assert.ok(ok.cuerpo.refresh_token, 'entrega refresh token');
  assert.ok(!('password_hash' in ok.cuerpo.user), 'no debe exponer el hash de la password');

  const mala = await api('POST', '/api/login', {
    body: { email: EMAIL_VIAJERO, password: 'PasswordIncorrecta' },
  });
  assertError(mala, 401, 'login con password incorrecta');

  const inexistente = await api('POST', '/api/login', {
    body: { email: `nadie-${SELLO}@test.com`, password: PASSWORD },
  });
  assertError(inexistente, 401, 'login de usuario inexistente');
});

test('login: intento de SQL injection devuelve 401 (sin bypass)', async () => {
  const inyeccion = await api('POST', '/api/login', {
    body: { email: "' OR '1'='1", password: 'x' },
  });
  assertError(inyeccion, 401, 'SQLi en el email');

  const comentario = await api('POST', '/api/login', {
    body: { email: "ana@test.com'--", password: 'x' },
  });
  assertError(comentario, 401, 'SQLi con comentario SQL');
});

test('/me: sin token 401 y con token 200', async () => {
  const sinToken = await api('GET', '/api/me');
  assertError(sinToken, 401, 'me sin token');

  const token = sesion.viajero.token;
  const conToken = await api('GET', '/api/me', { token });
  assert.equal(conToken.status, 200, `me con token: ${conToken.texto}`);
  assert.equal(conToken.cuerpo.user.email, EMAIL_VIAJERO);
  assert.equal(conToken.cuerpo.user.rol, 'viajero');
});

test('/me: token manipulado 401', async () => {
  const token = sesion.viajero.token;
  const pegado = await api('GET', '/api/me', { token: `${token}x` });
  assertError(pegado, 401, 'token con un caracter pegado');

  // Payload firmado pero alterado (el rol pasa a admin): la firma ya no cierra.
  const partes = token.split('.');
  const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  payload.rol = 'admin';
  const alterado = `${partes[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${partes[2]}`;
  const respuesta = await api('GET', '/api/me', { token: alterado });
  assertError(respuesta, 401, 'token con payload alterado');
});

test('refresh: rota el token y el anterior no se puede reusar (401)', async () => {
  const refreshViejo = sesion.viajero.refresh_token;

  const rotado = await api('POST', '/api/refresh', { body: { refresh_token: refreshViejo } });
  assert.equal(rotado.status, 200, `refresh: ${rotado.texto}`);
  assert.ok(rotado.cuerpo.token, 'entrega access token nuevo');
  assert.notEqual(rotado.cuerpo.refresh_token, refreshViejo, 'el refresh debe rotarse');

  // Reuso del refresh ya canjeado: queda revocado -> 401.
  const reuso = await api('POST', '/api/refresh', { body: { refresh_token: refreshViejo } });
  assertError(reuso, 401, 'reuso del refresh token');

  const basura = await api('POST', '/api/refresh', { body: { refresh_token: 'basura' } });
  assertError(basura, 401, 'refresh token invalido');
});

test('routing: endpoint inexistente devuelve 404', async () => {
  const r = await api('GET', `/api/no-existe-${SELLO}`);
  assertError(r, 404, 'endpoint inexistente');
});

test('routing: metodo incorrecto devuelve 405 con header Allow', async () => {
  const r = await api('POST', '/api/me');
  assertError(r, 405, 'metodo incorrecto');

  const allow = r.headers.get('allow');
  assert.ok(allow, 'la respuesta 405 debe traer el header Allow');
  assert.ok(allow.includes('GET'), `Allow deberia incluir GET (vino ${allow})`);
});

test('roles: el viajero no entra al panel de agentes (403)', async () => {
  const r = await api('GET', '/api/admin/incidentes', { token: sesion.viajero.token });
  assertError(r, 403, 'viajero en la cola de agentes');
});

test('roles: el viajero no entra al panel de usuarios (403)', async () => {
  const r = await api('GET', '/api/admin/usuarios', { token: sesion.viajero.token });
  assertError(r, 403, 'viajero en el panel de usuarios');
});

test('roles: el agente no entra al panel de usuarios (403)', async () => {
  const r = await api('GET', '/api/admin/usuarios', { token: sesion.agente.token });
  assertError(r, 403, 'agente en el panel de usuarios');
});

test('admin: lista usuarios, crea un agente (201), lo promueve y el historial lo registra', async () => {
  const token = sesion.admin.token;

  const listado = await api('GET', '/api/admin/usuarios?limit=5', { token });
  assert.equal(listado.status, 200, `listado: ${listado.texto}`);
  assert.ok(Array.isArray(listado.cuerpo.data), 'la lista trae data');
  assert.equal(typeof listado.cuerpo.total, 'number');
  assert.equal(listado.cuerpo.limit, 5);
  assert.equal(listado.cuerpo.page, 1);

  // El alta desde el panel permite cualquier rol (a diferencia del registro publico).
  const alta = await api('POST', '/api/admin/usuarios', {
    token,
    body: { nombre: 'Agente de Prueba', email: EMAIL_ALTA, password: PASSWORD, rol: 'viajero' },
  });
  assert.equal(alta.status, 201, `alta de usuario: ${alta.texto}`);
  assert.equal(alta.cuerpo.data.email, EMAIL_ALTA);
  assert.equal(alta.cuerpo.data.rol, 'viajero');
  const idAlta = alta.cuerpo.data.id;
  sesion.idAlta = idAlta;

  const duplicado = await api('POST', '/api/admin/usuarios', {
    token,
    body: { nombre: 'Agente Repetido', email: EMAIL_ALTA, password: PASSWORD, rol: 'agente' },
  });
  assertError(duplicado, 409, 'alta con email duplicado');

  // Promocion: el usuario pasa a agente.
  const promover = await api('PUT', `/api/admin/usuarios/${idAlta}`, {
    token,
    body: { rol: 'agente', motivo: 'promocion de la suite' },
  });
  assert.equal(promover.status, 200, `promocion: ${promover.texto}`);
  assert.equal(promover.cuerpo.data.rol, 'agente');

  // El historial del usuario registra el cambio de rol.
  const historial = await api('GET', `/api/admin/usuarios/${idAlta}/historial`, { token });
  assert.equal(historial.status, 200, `historial: ${historial.texto}`);
  assert.ok(Array.isArray(historial.cuerpo.data), 'el historial trae data');
  assert.equal(historial.cuerpo.usuario.email, EMAIL_ALTA);

  const cambio = historial.cuerpo.data.find((e) => e.accion === 'cambio_rol');
  assert.ok(cambio, 'el historial tiene que registrar el cambio de rol');
  assert.equal(cambio.valor_anterior, 'viajero');
  assert.equal(cambio.valor_nuevo, 'agente');
  assert.ok(
    historial.cuerpo.data.some((e) => e.accion === 'crear_usuario'),
    'el historial tiene que registrar el alta'
  );

  // El feed global tambien ve el cambio.
  const feed = await api('GET', `/api/admin/historial?usuario_id=${idAlta}`, { token });
  assert.equal(feed.status, 200, `feed: ${feed.texto}`);
  assert.ok(
    feed.cuerpo.data.some((e) => e.accion === 'cambio_rol' && e.valor_nuevo === 'agente'),
    'el feed global muestra el cambio de rol'
  );
});

test('admin: no puede cambiarse el propio rol ni desactivar su cuenta (400)', async () => {
  const token = sesion.admin.token;
  const idAdmin = sesion.admin.user.id;

  const cambioRol = await api('PUT', `/api/admin/usuarios/${idAdmin}`, {
    token,
    body: { rol: 'agente' },
  });
  assertError(cambioRol, 400, 'cambio de rol propio');

  const autoBaja = await api('PUT', `/api/admin/usuarios/${idAdmin}`, {
    token,
    body: { activo: false },
  });
  assertError(autoBaja, 400, 'auto-desactivacion');
});

test('admin: la base no puede quedar sin administradores activos', async () => {
  const token = sesion.admin.token;
  const idAdmin = sesion.admin.user.id;

  const listar = async () => {
    const r = await api('GET', '/api/admin/usuarios?rol=admin&limit=200', { token });
    assert.equal(r.status, 200, `listado de admins: ${r.texto}`);
    return r.cuerpo.data;
  };

  const antes = await listar();
  const activosAntes = antes.filter((u) => u.activo === true);
  assert.ok(activosAntes.length >= 1, 'la base debe arrancar con al menos un admin activo');

  // El actor autenticado siempre es un admin activo (Auth revalida rol y activo
  // contra la BD en cada request), asi que el auto-guard (400) se adelanta a la
  // red de seguridad "debe quedar al menos un administrador activo" (409).
  // Lo que se verifica aca es el invariante observable: la API rechaza la baja
  // y sigue dejando admins activos.
  const baja = await api('PUT', `/api/admin/usuarios/${idAdmin}`, { token, body: { activo: false } });
  assert.ok(
    [400, 409].includes(baja.status),
    `la baja del admin deberia ser rechazada (400/409), vino ${baja.status} (${baja.texto})`
  );

  const despues = await listar();
  const activosDespues = despues.filter((u) => u.activo === true);
  assert.ok(activosDespues.length >= 1, 'no puede quedar la base sin admins activos');
  assert.equal(
    activosDespues.length,
    activosAntes.length,
    'la API no puede desactivar admins por su cuenta'
  );
});

test('roles: el rol se revalida contra la BD (el token deja de servir si baja a viajero)', async () => {
  const idAlta = sesion.idAlta;
  assert.ok(idAlta > 0, 'el alta del admin tiene que existir');

  // Login del usuario promoted (ya es agente).
  const loginAgenteNuevo = await api('POST', '/api/login', {
    body: { email: EMAIL_ALTA, password: PASSWORD },
  });
  assert.equal(loginAgenteNuevo.status, 200, `login del agente nuevo: ${loginAgenteNuevo.texto}`);
  assert.equal(loginAgenteNuevo.cuerpo.user.rol, 'agente');
  const tokenAgente = loginAgenteNuevo.cuerpo.token;

  // Con rol agente entra al panel de agentes.
  const cola = await api('GET', '/api/admin/incidentes', { token: tokenAgente });
  assert.equal(cola.status, 200, `cola de agentes: ${cola.texto}`);

  // El admin lo degrada a viajero: el mismo token deja de servir para el panel.
  const degradar = await api('PUT', `/api/admin/usuarios/${idAlta}`, {
    token: sesion.admin.token,
    body: { rol: 'viajero', motivo: 'degradacion de la suite' },
  });
  assert.equal(degradar.status, 200, `degradacion: ${degradar.texto}`);
  assert.equal(degradar.cuerpo.data.rol, 'viajero');

  const trasDegradar = await api('GET', '/api/admin/incidentes', { token: tokenAgente });
  assertError(trasDegradar, 403, 'token de agente con el rol degradado');

  // El token sigue siendo valido para lo que el rol nuevo permite.
  const me = await api('GET', '/api/me', { token: tokenAgente });
  assert.equal(me.status, 200, 'el token sigue sirviendo con el rol vigente');
  assert.equal(me.cuerpo.user.rol, 'viajero');
});
