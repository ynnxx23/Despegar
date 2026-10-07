# Documentación de Desarrollo — Despegar Grupo 8

> Especificaciones técnicas: stack, nomenclaturas, arquitectura, API, base de datos,
> seguridad, apps, testing y entorno. Visión general en `DOC_PROYECTO.md`.

## 1. Stack y versiones

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Apps móviles | React Native + Expo (JavaScript) | Expo SDK 57, RN 0.86, React 19.2 | Sin React Navigation ni Axios (decisión §12) |
| Almacenamiento móvil | expo-secure-store | 57.x | Token fuera de AsyncStorage plano |
| Backend | PHP POO + PDO | PHP 8.2 | Sin framework; front-controller propio |
| Base de datos | PostgreSQL | 15 (imagen Docker: 16) | Rutinas en plpgsql/SQL |
| Driver PHP-DB | pdo_pgsql | (extensión `php.ini`) | prepared nativo, sin emulación |
| Entorno local | PHP 8.2 CLI + servicio PostgreSQL x64 15 | — | Solo PostgreSQL desde el inicio |
| Utilidades | Node 24, Python 3.8, PowerShell 5.1, Git 2.51 | — | Scripts de test en `.ps1` |
| Docker | Compose (opcional) | php:8.2-apache, postgres:16 | Solo `config` validado; `up` manual |

Dependencia móvil justificada: `expo-secure-store` (requisito TRANS-70, token seguro).
`@expo/vector-icons` NO se usa (iconografía con texto; ver §13).

## 2. Estructura del repositorio

```
despegar/
  DOC_PROYECTO.md / DOC_DESARROLLO.md / PLAN_DESARROLLO_DESPEGAR.md / README.md
  backend/
    public/index.php          # único punto de entrada (router + CORS + init)
    .env / .env.example       # secretos (.env gitignored, ver §11)
    src/Config.php            # lee .env sin librerías
    src/Database.php          # singleton PDO pgsql
    src/Utils/JwtHS256.php    # JWT HS256 manual (hash_hmac + hash_equals)
    src/Utils/Response.php    # JSON uniforme {data} / {error:{code,message}}
    src/Middleware/Auth.php   # Bearer + requireRole (401/403)
    src/Models/              # Usuario, Reserva, Incidente, Respuesta (encapsulamiento + prepared)
    src/Controllers/         # Auth, Itinerario, Incidentes (viajero), Admin (agente)
  db/schema.sql              # tablas + trigger + 3 funciones + 1 procedimiento
  db/seeds.sql               # CALL sembrar_demo() (idempotente)
  apps/
    shared/                  # theme.js, api.js (fetch+Bearer+401), auth.js (SecureStore),
                             # components.js (Button/Input/Banner/Badge/Empty/Loading), format.js
    viajero/                 # app.json, metro.config.js, package.json, App.js, screens/
    agente/                  # idem (sin registro)
  tests/                     # api_f2_auth, api_f3_dominio, api_f7_integracion (.ps1) + mint_expired.php
  docker-compose.yml         # postgres:16 + api php:8.2-apache (opcional)
```

Responsabilidades: `Models` solo SQL preparado; `Controllers` validan y responden;
`index.php` solo rutea; `shared/` es el único código común entre apps.

## 3. Nomenclaturas y convenciones

| Elemento | Convención | Ejemplo |
|---|---|---|
| Clases PHP | PascalCase, una por archivo | `AuthController.php`, `JwtHS256` |
| Métodos/funciones PHP y JS | camelCase | `findByEmail`, `listByUser`, `onRefresh` |
| Variables JS | camelCase | `detalleId`, `miosKey` |
| Componentes RN | PascalCase + sufijo Screen | `ColaScreen.js`, `AppButton` |
| Tablas/columnas SQL | snake_case plural/singular | `incidentes`, `user_id`, `creado_at` |
| Rutinas SQL | snake_case verbal | `crear_respuesta()`, `resumen_cola()`, `sembrar_demo()` |
| Checks SQL | `CHECK (col IN (...))` con lista cerrada | rol, tipo, prioridad, estado |
| Endpoints REST | sustantivos plural, sin verbos | `GET /api/admin/incidentes`, `POST /api/incidentes` |
| JSON | `{data}` éxito / `{error:{code,message}}` fallo | uniforme vía `Response` |
| Commits | Conventional Commits en español | `feat:`, `fix:`, `test:`, `docs:`, `style:` |
| Tokens de diseño | `theme.colors|spacing|radius|type` | `theme.colors.primary` (`#6C2BD9`) |
| Secrets | solo `backend/.env`, jamás en código | `.env.example` con placeholders |

Reglas: sin tildes en identificadores de BD/API (`Critica`, no `Crítica`; en UI sí);
paginación `limit` 1-50; fechas ISO; sin `console.log` con datos sensibles.

## 4. Backend

Flujo por request: `index.php` (CORS/OPTIONS → `bodyJson()` → `Database::pdo()`) →
rutas exactas o regex `^/api/...(\d+)...$` → `Auth::requireRole([...])` → Controller →
`Response::json/error` (con `exit`). Errores 500 genéricos al cliente + `error_log` interno.
`Auth::bearer()` acepta `HTTP_AUTHORIZATION`, `REDIRECT_HTTP_AUTHORIZATION` y
`getallheaders()` (compatibilidad Apache/CLI).

| Clase | Rol |
|---|---|
| `Config` | env con defaults seguros |
| `Database` | PDO `pgsql:host;port;dbname`, `ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false` |
| `JwtHS256` | `encode/decode`; exige `alg=HS256`, firma `hash_equals`, `exp>now` |
| `Auth` | extrae Bearer; 401 sin/inválido/expirado; 403 rol insuficiente |
| `Usuario` | `findByEmail/findById/create`, `hashPassword` (BCRYPT cost 10-12), `toSafe` (sin hash) |
| `Reserva` | `listByUser` (solo propias), `belongsTo` (propiedad) |
| `Incidente` | CRUD + `listAll` (filtros/orden/paginación) + `countAll`; `norm()` castea ints (PG devuelve strings) |
| `Respuesta` | `listByIncidente` + `responderAtomico` vía `SELECT crear_respuesta(?,?,?)`; `P0002`→404 |
| `AuthController` | `register` (solo `viajero`, 409 duplicado), `login` (401 genérico), `me` |
| `ItinerarioController` | `show` (viajero) |
| `IncidentesController` | `mios/crear/ver/respuestas` con ownership (`403` recurso ajeno) |
| `AdminController` | `cola/ver/actualizar/responder/resumen` (solo `agente`) |

## 5. API — referencia

Base `/api`. Auth: `Authorization: Bearer <jwt>` (salvo register/login/health).

| Método | Ruta | Rol | Body / params | Éxito | Errores |
|---|---|---|---|---|---|
| GET | `/health` | — | — | 200 `{ok,service,fase}` | — |
| POST | `/register` | público | `{nombre 2-100, email, password 8-72}` | 201 `{user,token}` (rol `viajero`) | 400, 409 |
| POST | `/login` | público | `{email,password}` | 200 `{user,token}` | 400, 401 |
| GET | `/me` | auth | — | 200 `{user}` | 401 |
| GET | `/itinerario` | viajero | — | 200 `{data:[reservas]}` | 401, 403 |
| GET | `/incidentes/mios?estado=` | viajero | filtro opcional | 200 `{data}` | 400, 401, 403 |
| POST | `/incidentes` | viajero | `{reserva_id?, tipo, titulo 5-120, descripcion 10-2000}` (`reserva_id` debe ser propia) | 201 (Baja/Abierto) | 400, 401, 403, 404 |
| GET | `/incidentes/:id` | dueño o agente | — | 200 | 401, 403, 404 |
| GET | `/incidentes/:id/respuestas` | dueño o agente | — | 200 `{data:[hilo]}` | 401, 403, 404 |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc&page=&limit=` | agente | filtros + paginación | 200 `{data,total,page,limit}` (defecto fecha ASC) | 400, 401, 403 |
| GET | `/admin/incidentes/resumen` | agente | — | 200 `{data:[{estado,prioridad,total}]}` | 401, 403 |
| GET/PUT | `/admin/incidentes/:id` | agente | `{prioridad?,estado?}` (PUT parcial) | 200 | 400, 401, 403, 404 |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | `{mensaje 2-2000}` | 201 (pasa a EnGestion) | 400, 401, 403, 404 |

## 6. Base de datos (PostgreSQL 15)

Tablas: `usuarios(id,nombre,email UNIQUE,password_hash,rol,creado_at)`,
`reservas(id,user_id→CASCADE,tipo,codigo,origen,destino,hotel,fechas,estado)`,
`incidentes(id,user_id→CASCADE,reserva_id→SET NULL,tipo,titulo,descripcion,prioridad,estado,creado_at,actualizado_at)`,
`respuestas(id,incidente_id→CASCADE,autor_id→CASCADE,mensaje)`.
Relaciones: usuarios 1:N reservas, 1:N incidentes; reservas 1:N incidentes (opcional);
incidentes 1:N respuestas. Índices: `idx_reservas_user`, `idx_incidentes_user`,
`idx_incidentes_cola(estado,prioridad,creado_at)`, `idx_respuestas_incidente`.

| Rutina | Tipo | Finalidad real |
|---|---|---|
| `touch_actualizado_at()` + trigger `trg_incidentes_touch` | trigger function | Mantiene `actualizado_at` automáticamente |
| `crear_respuesta(INT,INT,TEXT)→INT` | function | Inserta respuesta + `EnGestion` en una transacción; la usa `AdminController` |
| `resumen_cola()` | function STABLE | Conteos por estado/prioridad para el panel |
| `sembrar_demo()` | PROCEDURE | Seed idempotente (agente+2 viajeros+reservas+incidente); `seeds.sql` = `CALL` |

Credenciales demo (solo desarrollo): `agente@despegar.com`/`Agente123`,
`maria@despegar.com`/`Agente456`, `ana@test.com`/`Viaje1234`, `bruno@test.com`/`Viaje5678` (hashes bcrypt en BD).

## 7. Autenticación y seguridad

- Hash: `password_hash(PASSWORD_BCRYPT, cost 10-12)`, salt automático, `password_verify`.
- JWT HS256 manual (`hash_hmac`+`hash_equals`): claims `{sub,rol,iat,exp}`, `exp=8h`
  (`JWT_TTL_HOURS` 1-24), sin passwords ni secretos en el payload; secreto ≥32 bytes en `.env`.
- Móvil: token en SecureStore (`auth.js` con adaptador memoria testeable); `api.js` adjunta
  Bearer y dispara `onUnauthorized`→logout ante 401 (expirado/inválido).
- Autorización: `requireRole` por endpoint; viajero filtrado por `user_id=sub`; 401 genérico
  en login (no revela si el email existe); `reserva_id` validada como propia.
- Entradas: whitelist de valores/longitudes, `PDO::prepare` en todo, `CHECK`s a nivel BD como
  defensa en profundidad, `limit≤50`, `Content-Type: application/json`, errores sin traces/SQL.

## 8. Apps móviles

Viajero (`despegar-viajero`): Login, Registro, Viajes (pull-refresh, vacío, reintentar),
Reportar (tipo+reserva opcional, contadores, `Alert` de confirmación, éxito con n°),
Incidentes (filtros, badges) y Detalle con hilo. Navegación por tabs + detalle apilado.
Agente (`despegar-agente`): Login corporativo (rechaza no-agente, sin registro), Cola
(resumen, filtros, orden asc/desc, paginación, highlight Crítica) y Gestión (PUT
prioridad/estado con confirmación en Resuelto, responder, hilo).

Compartido (`apps/shared`): `theme` (violeta `#6C2BD9`/`#4A1FA3`, fondo `#F6F5FB`,
semántica prioridad/estado, spacing base 8, radius 12/16, type 24/18/16/14, táctil 48),
`api`, `auth`, `components` (Button/Input/Banner/Badge/Empty/Loading),
`format` (etiquetas legibles, fechas `es-AR`). Navegación condicional sin React Navigation;
`metro.config.js` con `watchFolders` para `../shared`; `app.json` por app.

## 9. Testing

Automático (requieren API en `:8000`): `tests/api_f2_auth.ps1` (10 checks: registro,
409/400, login, 401, SQLi, me, tokens, no-leak), `tests/api_f3_dominio.ps1` (20 checks:
aislamiento, ownership, cola, filtros, responder, PUT, 403/404), `tests/api_f7_integracion.ps1`
(expirado→401 + loop completo) con `tests/mint_expired.php`. Resultado de referencia: 33/33
en verde sobre BD prístina.
Estructura UI: checker de balance JSX (`jsx_check.py`, 14/14) + test Node de `auth`/`api`
(roundtrip SecureStore, 401→callback). Manual: checklist Expo Go en `README.md`.

## 10. Git

Repo local, identidad `Grupo Despegar`, 6+ commits (`docs/feat/test/fix/style`),
`.gitignore` (`.env`, `node_modules/`, `.expo/`, `.vscode/`). `backend/.env` jamás trackeado
(verificado con `ls-files`). Sin remoto: no hay push.

## 11. Entorno y despliegue

Servicios: PostgreSQL x64 15 `:5432` (rol `despegar`/`despegar_dev`, BD `despegar`;
superusuario local con password propia), API `php -S 0.0.0.0:8000 -t backend/public`
(`0.0.0.0` para alcance LAN; requiere `pdo_pgsql` en `php.ini`), apps con `BASE_URL` a la IP
LAN (`10.0.2.2` en emulador Android). Variables `.env`: `DB_HOST/PORT/NAME/USER/PASS`,
`JWT_SECRET`, `BCRYPT_COST`, `JWT_TTL_HOURS`. Comandos BD en `README.md`.

## 12. Decisiones técnicas

PHP puro sin framework (evalúa POO/PDO, despliegue simple) · JWT manual sin
`firebase/php-jwt` (cero dependencias) · PostgreSQL por rutinas del integrador ·
funciones + 1 procedimiento, cada objeto con uso real · dos apps separadas (aíslan permisos)
· `fetch` en vez de Axios · sin refresh-token v1 (re-login 8h) · Docker solo opcional ·
texto plano en UI (sin emojis) · fuente del sistema (sin peso extra).

## 13. Limitaciones conocidas

Runtime Expo Go en dispositivo, `docker compose up` (daemon apagado; `config` válido),
CORS `*` solo-dev, credenciales demo en repo (cambiar en prod), `password` superusuario PG
local documentada en el historial del proyecto.
