# 03 — Backend: cómo funciona por dentro

Archivos: `backend/` (24 archivos PHP, ~90 KB). Sin framework, sin Composer,
sin dependencias.

---

## 1. El router (`backend/src/Utils/Router.php`)

Una tabla de rutas: método → patrón → `{roles, handler}`.

```php
$router->get('/api/admin/incidentes/resumen', ['agente','admin'], [AdminController::class,'resumen']);
$router->get('/api/admin/incidentes/{id}',      ['agente','admin'], [AdminController::class,'ver']);
$router->put('/api/admin/incidentes/{id}',      ['agente','admin'], [AdminController::class,'actualizar']);
```

Características:

- **Patrones con parámetros**: `{id}` se compila a `(?P<id>[^/]+)`. Los handlers
  reciben `$params` ya parseado.
- **Orden de declaración importa**: las rutas literales (`/resumen`) se declaran antes
  que las genéricas (`/{id}`), así que `/admin/incidentes/resumen` no se confunde con
  un incidente llamado "resumen".
- **405 real**: si el path matchea pero el método no, responde `405` con el header
  `Allow: GET, POST`. Antes devolvía un `404` genérico.
- **Roles declarativos**: `['agente','admin']` → el router llama a
  `Auth::requireRole()` antes del handler. `null` = ruta pública.
- **Versionado**: `/api/v1/...` es alias exacto de `/api/...` (se normaliza el path).
- **Argumentos por prefijo**: el handler recibe `(db, claims, params, body, query)` y
  el router recorta el prefijo según lo que el handler declare (vía `ReflectionMethod`).
  Es una salvaguarda: si alguien declara mal la firma, el error es visible y no
  silencioso.

```php
// Router::dispatch (resumen)
foreach ($this->routes as $m => $porPatron) {
  foreach ($porPatron as $patron => $ruta) {
    if (!preg_match($this->regex($patron), $path, $mch)) continue;
    if ($m !== $metodo) { $permitidos[] = $m; continue; }   // → 405
    $claims = $ruta['roles'] ? Auth::requireRole($db, $ruta['roles']) : [];
    call_user_func_array($ruta['handler'], [/* prefijo recortado */]);
  }
}
```

---

## 2. Middleware de autenticación (`backend/src/Middleware/Auth.php`)

```php
Auth::requireRole(PDO $db, array $roles): array
```

1. `bearer()` — extrae `Authorization: Bearer <jwt>` (soporta `getallheaders()`).
2. `JwtHS256::decode()` — valida firma y expiración. Si falla → **401**.
3. `rolVigente()` — **consulta la base**: `SELECT rol, activo FROM usuarios WHERE id = ?`.
   - usuario inexistente → 401
   - `activo = false` → 401
4. Si el rol vigente no está en la lista pedida → **403**.

Diferencia 401 vs 403 (decila si preguntan):

| Situación | Código | Significado |
|---|---|---|
| Sin header, token inválido/expirado, usuario inexistente o desactivado | **401** | "No sé quién sos" (o tu credencial ya no sirve) |
| Identidad válida pero sin permiso para este recurso | **403** | "Sé quién sos, pero no podés" |

**La revalidación del rol en cada request** es la decisión que hace que "degradar una
cuenta" funcione al instante, sin esperar a que expire el JWT (8 h). Cuesta 1 SELECT
por request: aceptable para este volumen, y es lo que el enunciado pedía
("control de roles, token de viajero NO accede a endpoints admin").

Compatibilidad: si una base vieja no tiene la columna `activo`, el middleware lo
detecta (código SQLSTATE 42703) y sigue consultando solo el rol.

---

## 3. JWT HS256 implementado a mano (`backend/src/Utils/JwtHS256.php`)

47 líneas, sin dependencias.

```php
// Firma
$h = b64u(json_encode(['alg'=>'HS256','typ'=>'JWT']));
$p = b64u(json_encode($claims));
$sig = b64u(hash_hmac('sha256', "$h.$p", $secret, true));

// Verificación (decode)
if ($header['alg'] !== 'HS256') return null;                 // alg confusion
if (!hash_equals($expected, $sig)) return null;              // timing-safe
if ($claims['exp'] < time()) return null;                     // expirado
if ($claims['iat'] > time() + 60) return null;                // reloj hacia futuro
```

- `base64url` con `rtrim(strtr(base64_encode($b), '+/', '-_'), '=')`.
- Claims: `{sub, rol, iat, exp}`. **Nunca** password ni datos sensibles.
- `sub` numérico, `rol` debe ser uno de `viajero|agente|admin` (lista cerrada).
- La vida se acota: `JWT_TTL_HOURS` entre 1 y 24 (defecto 8).
- Fail-fast: si `JWT_SECRET` mide menos de 32 caracteres, la API **no opera** (500
  genérico, el valor nunca se expone).

---

## 4. Refresh tokens (`backend/src/Models/RefreshToken.php`)

| Aspecto | Implementación |
|---|---|
| Generación | `bin2hex(random_bytes(32))` → 64 hex |
| Almacenamiento | **solo el SHA-256** en `refresh_tokens.token_hash` (UNIQUE) |
| Vida | 30 días (`REFRESH_TTL_DAYS`, entre 1 y 90) |
| Rotación | `rotar()` marca el viejo como revocado y emite uno nuevo en la misma operación |
| Revocación | `POST /api/logout` revoca el token que le mandes |
| Limpieza | `purgar()` borra vencidos y revocados viejos (se llama en cada login) |

**Reuso = 401**: si alguien captura un refresh token y lo usa dos veces, la segunda
falla (el primero ya quedó revocado). Es la propiedad de "rotación de un solo uso".

---

## 5. Controllers

| Controller | Endpoints | Responsabilidad |
|---|---|---|
| `AuthController` | `/register` `/login` `/refresh` `/logout` `/me` | Sesión. Registra **solo viajeros** (el alta de agentes es del admin). Aplica cuotas. Login genérico (no revela si el email existe) |
| `ItinerarioController` | `/itinerario` | Las reservas del viajero (solo lectura) |
| `IncidentesController` | `/incidentes/mios` `/incidentes` `/incidentes/:id` `/incidentes/:id/respuestas` | Dominio del viajero. Al crear calcula la **prioridad sugerida**; en la proyección `toPublic()` **nunca** expone la prioridad real, el SLA ni el triaje |
| `AdminController` | `/admin/incidentes*` `/admin/mi-cola` `/admin/agentes` | Cola, triaje, SLA, respuesta, claim/release/derivar/seguir, historial |
| `AdminUsuariosController` | `/admin/usuarios*` `/admin/historial` | **Solo rol admin**: alta de usuarios, cambio de rol, activar/desactivar, reset de contraseña, historial de cambios |

### Validaciones (las que se ven en el código)

| Dato | Regla | Dónde |
|---|---|---|
| Nombre | 2-100 caracteres | `AuthController`, `AdminUsuariosController` |
| Email | `FILTER_VALIDATE_EMAIL`, máx 160, único (409) | ambos |
| Password | 8-72 caracteres (límite de bcrypt), bcrypt cost 10-12 | ambos |
| Título de incidente | 5-120 | `IncidentesController` |
| Descripción | 10-2000 | `IncidentesController` |
| Tipo de incidente | lista cerrada de 7 valores | `IncidentesController` |
| Prioridad | `Baja|Alta|Critica` | `AdminController` |
| Estado | `Abierto|EnGestion|Resuelto` | `AdminController` |
| Motivo | máx 300 caracteres | `AdminController`, `AdminUsuariosController` |
| Rol | `viajero|agente|admin` | `AdminUsuariosController` |

---

## 6. Models

| Model | Tabla | Qué aporta |
|---|---|---|
| `Usuario` | `usuarios` | Búsqueda, listado para el panel, cambios de rol/activo/password, conteo de admins |
| `Reserva` | `reservas` | Itinerario del viajero; `belongsTo()` para validar que la reserva del incidente sea propia |
| `Incidente` | `incidentes` | Sugerencia de prioridad, cola con filtros de servidor, SLA, orden de urgencia |
| `GestionCaso` | `incidentes_eventos`, `incidente_seguidores` | Quién atiende el caso, quiénes lo siguen, historial (público y interno) |
| `Respuesta` | `respuestas` | Hilo 1:N; inserción atómica vía función SQL |
| `RefreshToken` | `refresh_tokens` | Emisión, rotación, revocación, purga |
| `Auditoria` | `usuarios_auditoria` | Historial de cambios de usuarios |

### Proyecciones (qué ve cada rol)

```php
Incidente::toPublic($row)  // viajero: quita prioridad, triado_por, triado_at, sla_vence_at, asignado_a
Incidente::toAgent($row)   // agente: fila completa
Usuario::toSafe($row)      // todos: id, nombre, email, rol, activo (¡sin hash!)
```

---

## 7. Reglas de negocio que vale la pena explicar

### 7.1 Sugerencia de prioridad (sin IA)

Base por tipo +keyword bump:

| Tipo | Base | | Tipo | Base |
|---|---|---|---|---|
| `Fraude` | Crítica | | `Hotel_sin_reserva` | Alta |
| `Vuelo_cancelado` | Alta | | `Equipaje` | Alta |
| `Cobro_indebido` | Alta | | `Vuelo_retrasado` | Baja |
| | | | `Otro` | Baja |

Keywords que suben **un** nivel (tope: Crítica): `urgente, varad, hoy, ahora, estafa,
menor, salud, hospital, embarazada, discapacidad`.

La sugerencia **nunca** decide la prioridad real: el caso entra con `prioridad = NULL`
(sin triage) y la prioridad la pone un agente. El viajero ve la sugerencia como
"orientación", no como promesa.

### 7.2 Claim atómico (concurrencia)

```php
$db->beginTransaction();
SELECT asignado_a, estado FROM incidentes WHERE id = ? FOR UPDATE;   // lock de fila
if ($asignado !== null && $asignado !== $yo) → 409 "Caso ya asignado a otro agente"
UPDATE incidentes SET asignado_a = ? WHERE id = ? AND (asignado_a IS NULL OR asignado_a = ?);
if (rowCount() === 0) → 409
if ($estado === 'Abierto') UPDATE ... SET estado = 'EnGestion';
INSERT INTO incidentes_eventos (...);   // evento 'claim'
$db->commit();
```

`FOR UPDATE` serializa a los dos agentes que cliccan "Reclamar" a la vez: el segundo
espera al lock y, cuando lo obtiene, ve que ya está asignado → 409.

### 7.3 El SLA no se renueva solo

```php
// AdminController::actualizar
$cambiaPrioridad = $prioridad !== null && $prioridad !== $actual['prioridad'];
$m->update($id, $prioridad, $estado, $actor, $cambiaPrioridad);
//                                        ↑ solo recalcula sla_vence_at si cambió la prioridad
```

Si no, un agente podía re-guardar el caso y "refrescar" el reloj de un SLA vencido:
el caso dejaba de contar como vencido sin que nadie lo hubiera atendido. **El SLA
mide el tiempo desde el triage real, no desde el último guardado.**

### 7.4 Transacciones donde importan

| Operación | Qué va atómico |
|---|---|
| `actualizar` | UPDATE del incidente + INSERT de los eventos (prioridad/triaje/estado/resuelto/reabierto) |
| `claim` | lock + update de asignado + cambio de estado + evento |
| `release` | UPDATE + evento |
| `derivar` | lock + update + evento con motivo |
| `responder` | Inserción de la respuesta + cambio a `EnGestion` en la función SQL `crear_respuesta()` |

Si algo falla a mitad, `rollBack()` y no queda el caso a medias (por ejemplo: prioridad
cambiada pero sin evento en el historial).

---

## 8. Seguridad (capa HTTP)

### Cuotas (`Utils/RateLimit.php`)

| Regla | Límite | Ventana | Clave |
|---|---|---|---|
| Login | 30 | 60 s | IP |
| Login | 20 | 60 s | cuenta (email) |
| Registro | 30 | 3600 s | IP |
| Refresh | 60 | 60 s | IP |

Al superarlas → **429** con `Retry-After` y `details.reintenta_en_segundos`.
Configurables por env (`LOGIN_RATE_LIMIT`, `LOGIN_RATE_ACCOUNT_LIMIT`,
`REGISTER_RATE_LIMIT`, `REFRESH_RATE_LIMIT`, y las ventanas).

**Por qué en archivo y no en memoria**: el server embebido de PHP levanta N workers
(`PHP_CLI_SERVER_WORKERS=8`), y cada worker es un proceso separado: un contador en
memoria contaría por proceso (8 veces el límite). El archivo con `flock` es atómico
entre procesos. Si el directorio no es escribible, el limitador hace *fail-open* y
queda logueado.

### Headers (`Utils/Security.php`)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-site
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains   (solo si es HTTPS)
```

### CORS (`Utils/Cors.php`)

Configurable por `CORS_ORIGIN`:

- vacío (defecto) → **no** se manda ninguna cabecera CORS (solo apps nativas).
- `*` → cualquier origen (solo dev; con `APP_ENV=production` queda logueado como aviso).
- lista separada por comas → allowlist exacta.

### Errores

- Handler global: cualquier excepción no controlada → **500 genérico** + `error_log`
  con el detalle. Nunca sale un trace ni un SQL al cliente.
- `Response::error($mensaje, $codigo, $details = [])` → `{"error":{"code","message","details"?}}`.
- `Response::json($data, $codigo)` → `{"data": ...}` y `exit`.

---

## 9. Variables de entorno

| Variable | Defecto | Para qué |
|---|---|---|
| `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` | `127.0.0.1:5432/despegar` | Conexión local |
| `DATABASE_URL` | — | Alternativa (Railway): tiene prioridad si `DB_HOST` está vacío |
| `JWT_SECRET` | — | **Obligatoria**, ≥32 chars. La API no arranca sin ella |
| `BCRYPT_COST` | 10 | 10-12 |
| `JWT_TTL_HOURS` | 8 | 1-24 |
| `REFRESH_TTL_DAYS` | 30 | 1-90 |
| `APP_ENV` | `development` | `production` activa el aviso de CORS abierto |
| `CORS_ORIGIN` | vacío | Allowlist |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_ACCOUNT_LIMIT` / `REGISTER_RATE_LIMIT` / `REFRESH_RATE_LIMIT` | 30/20/30/60 | Cuotas |

`.env` está en `.gitignore` (y `.env.*` también, salvo `.env.example`), así que los
secretos nunca entran al repo.

---

## 10. Puntos del backend que todavía se pueden mejorar

- **Sin observabilidad**: solo `error_log` (texto plano). Falta logging estructurado
  con request-id y métricas (latencia, errores por código).
- **Síncrono**: un request PHP bloquea un worker. Con 8 workers y carga de demo va bien;
  para producción faltaría una cola o PHP-FPM con pool.
- **Sin caché**: el resumen de la cola hace 4 queries en cada llamada; con volumen real
  convendría cachearlo o materializarlo.
- **Sin versionado real del esquema**: hay alias `/api/v1`, pero el schema evoluciona
  con migraciones numeradas; un cliente viejo con un payload viejo no está soportado.
