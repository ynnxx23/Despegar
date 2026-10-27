# Documentación de Desarrollo — Despegar Grupo 8

> Especificaciones técnicas: stack, nomenclaturas, arquitectura, API, base de datos,
> seguridad, apps, testing y entorno. Visión general en `DOC_PROYECTO.md`.

## 1. Stack y versiones

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Apps móviles | React Native + Expo (JavaScript) | Expo SDK 57, RN 0.86, React 19.2 | Sin React Navigation ni Axios (decisión §12) |
| Almacenamiento móvil | expo-secure-store | 57.x | Token fuera de AsyncStorage plano |
| Backend | PHP POO + PDO | PHP 8.5.12 | Sin framework; front-controller propio |
| Base de datos | PostgreSQL | 15 (imagen Docker: 16) | Rutinas en plpgsql/SQL |
| Driver PHP-DB | pdo_pgsql | (extensión `php.ini`) | prepared nativo, sin emulación |
| Entorno local | PHP 8.5.12 CLI + servicio PostgreSQL x64 15 | — | Solo PostgreSQL desde el inicio |
| Utilidades | Node 24, Python 3.8, PowerShell 5.1, Git 2.51 | — | Scripts de test en `.ps1` |
| Docker | Compose (opcional) | php:8.5.12-apache, postgres:16 | Solo `config` validado; `up` manual |

Dependencia móvil justificada: `expo-secure-store` (requisito TRANS-70, token seguro).
`@expo/vector-icons` NO se usa (iconografía con texto; ver §13).

## 2. Estructura del repositorio

```
despegar/
  DOC_PROYECTO.md / DOC_DESARROLLO.md / PLAN_DESARROLLO_DESPEGAR.md / README.md
  backend/
    public/index.php          # único punto de entrada (router + CORS + init)
    .env / .env.example       # secretos (.env gitignored, ver sección 11)
    src/Config.php            # lee .env sin librerías
    src/Database.php          # singleton PDO pgsql (DB_* local o DATABASE_URL en Railway)
    src/Utils/JwtHS256.php    # JWT HS256 manual (hash_hmac + hash_equals)
    src/Utils/Response.php    # JSON uniforme {data} / {error:{code,message}}
    src/Utils/Cors.php        # CORS según CORS_ORIGIN (vacío = sin cabeceras)
    src/Middleware/Auth.php   # Bearer + requireRole (401/403) + rol revalidado contra la BD
    src/Models/              # Usuario, Reserva, Incidente, GestionCaso, Respuesta, RefreshToken, Auditoria
                              #   (encapsulamiento + prepared)
    src/Controllers/         # Auth, Itinerario, Incidentes (viajero), Admin (agente), AdminUsuarios (admin)
    src/Utils/               # Router (tabla de rutas + 405), RateLimit, Security (headers), Cors, JwtHS256, Response
  db/schema.sql              # schema v4: tablas + triggers + funciones + \ir seed_demo.sql
  db/seed_demo.sql           # procedimiento sembrar_demo() (datos de demo, idempotente)
  db/seeds.sql               # CALL sembrar_demo() (idempotente)
  db/migrate_0*.sql          # upgrade de bases con un schema anterior (idempotentes)
  apps/
    shared/                  # theme.js, api.js (fetch+Bearer+timeout+refresh+401),
                              # auth.js (SecureStore), components.js (Button/Input/Banner/Badge/
                              #   Empty/Loading/FormScrollView/ApiWarning),
                              # format.js (etiquetas, estados, prioridades, fechas)
    viajero/                 # app.json, metro.config.js, package.json, App.js, screens/
    agente/                  # idem (sin registro) + components/ (paneles y estilos de la gestión)
  deploy/                    # api-url.txt (URL pública de la API) + init-db.ps1 (schema en Railway)
  docs/                      # api.md, app-viajero.md, app-agente.md, railway.md
  tests/                     # api_f2_auth, api_f3_dominio, api_f7_integracion, api_f8_gestion
                              #   (.ps1) + mint_expired.php + api_client_refresh.test.mjs (Node)
  docker-compose.yml         # postgres:16 + api php:8.5.12-apache (opcional)
  Dockerfile / .dockerignore # imagen de producción para Railway
  .railwayignore             # qué se sube con `railway up`
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
| Tokens de diseño | `theme.colors\|spacing\|radius\|type` | `theme.colors.primary` (`#6C2BD9`) |
| Secrets | solo `backend/.env`, jamás en código | `.env.example` con placeholders |

Reglas: sin tildes en identificadores de BD/API (`Critica`, no `Crítica`; en UI sí);
paginación `limit` 1-50; fechas ISO; sin `console.log` con datos sensibles.

## 4. Backend

Flujo por request: `index.php` (CORS/OPTIONS → `bodyJson()` → `Database::pdo()`) →
rutas exactas o regex `^/api/...(\d+)...$` → `Auth::requireRole($db, [...])` → Controller →
`Response::json/error` (con `exit`). Errores 500 genéricos al cliente + `error_log` interno.
`Auth::bearer()` acepta `HTTP_AUTHORIZATION`, `REDIRECT_HTTP_AUTHORIZATION` y
`getallheaders()` (compatibilidad Apache/CLI).

| Clase | Rol |
|---|---|
| `Config` | env con defaults seguros |
| `Database` | PDO `pgsql:host;port;dbname`, `ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false` |
| `JwtHS256` | `encode/decode`; exige `alg=HS256`, firma `hash_equals`, `exp>now` |
| `Cors` | cabeceras según `CORS_ORIGIN`: vacío = ninguna, `*` = cualquiera, lista = allowlist |
| `Auth` | extrae Bearer; 401 sin/inválido/expirado; 403 rol insuficiente; el rol se revalida contra la BD |
| `Usuario` | `findByEmail/findById/create`, `hashPassword` (BCRYPT cost 10-12), `toSafe` (sin hash) |
| `Reserva` | `listByUser` (solo propias), `belongsTo` (propiedad) |
| `Incidente` | CRUD + `listAll` (filtros/orden/paginación) + `countAll`; `miCola`/`countMiCola` con vista (`mios`/`siguiendo`); `norm()` castea ints (PG devuelve strings) |
| `GestionCaso` | quién reclama el caso (`asignado`), quiénes lo siguen (`seguidores`), eventos e historial (interno y público del viajero) |
| `Respuesta` | `listByIncidente` + `responderAtomico` vía `SELECT crear_respuesta(?,?,?)`; `P0002`→404 |
| `RefreshToken` | refresh tokens opacos: la BD guarda solo el SHA-256; `emitir`/`rotar`/`revocar` |
| `AuthController` | `register` (solo `viajero`, 409 duplicado), `login` (401 genérico), `refresh`, `logout`, `me` |
| `ItinerarioController` | `show` (viajero) |
| `IncidentesController` | `mios/crear/ver/respuestas` con ownership (`403` recurso ajeno) |
| `AdminController` | `cola/miCola/ver/actualizar/responder/resumen/claim/release/derivar/seguir` (solo `agente`) |

## 5. API — referencia

Base `/api`. Auth: `Authorization: Bearer <jwt>` (salvo register/login/health).

| Método | Ruta | Rol | Body / params | Éxito | Errores |
|---|---|---|---|---|---|
| GET | `/health` | — | — | 200 `{ok,service,fase}` | — |
| POST | `/register` | público | `{nombre 2-100, email, password 8-72}` | 201 `{user,token,refresh_token}` (rol `viajero`) | 400, 409 |
| POST | `/login` | público | `{email,password}` | 200 `{user,token,refresh_token}` | 400, 401 |
| POST | `/refresh` | público | `{refresh_token}` (rota el refresh) | 200 `{user,token,refresh_token}` | 401 |
| POST | `/logout` | público | `{refresh_token}` (opcional) | 200 `{data:{ok:true}}` | — |
| GET | `/me` | auth | — | 200 `{user}` | 401 |
| GET | `/itinerario` | viajero | — | 200 `{data:[reservas]}` | 401, 403 |
| GET | `/incidentes/mios?estado=` | viajero | filtro opcional | 200 `{data}` | 400, 401, 403 |
| POST | `/incidentes` | viajero | `{reserva_id?, tipo, titulo 5-120, descripcion 10-2000}` (`reserva_id` debe ser propia) | 201 (Baja/Abierto) | 400, 401, 403, 404 |
| GET | `/incidentes/:id` | dueño o agente | — | 200 | 401, 403, 404 |
| GET | `/incidentes/:id/respuestas` | dueño o agente | — | 200 `{data:[hilo]}` | 401, 403, 404 |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc\|urgencia&page=&limit=` | agente | filtros + paginación; cada caso trae `asignado_a`, `asignado_nombre`, `siguiendo`, `seguidores_count` | 200 `{data,total,page,limit}` (defecto fecha ASC) | 400, 401, 403 |
| GET | `/admin/incidentes/resumen` | agente | — | 200 `{data:[{estado,prioridad,total}], sin_triar, vencidos, mios}` | 401, 403 |
| GET/PUT | `/admin/incidentes/:id` | agente | GET devuelve `{incidente, usuario, reserva, asignado, seguidores, siguiendo, mi_asignado}`; `{prioridad?,estado?}` (PUT parcial) | 200 | 400, 401, 403, 404 |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | `{mensaje 2-2000}` | 201 (pasa a EnGestion) | 400, 401, 403, 404 |
| POST | `/admin/incidentes/:id/claim` | agente | reclama el caso (`asignado_a=yo`, Abierto→EnGestion) | 200 | 401, 403, 404, 409 (ya es de otro) |
| POST | `/admin/incidentes/:id/release` | agente | libera el caso (`asignado_a=NULL`) | 200 | 401, 403, 404 |
| POST | `/admin/incidentes/:id/derivar` | agente | `{agente_id, motivo?}` | 200 | 400, 401, 403, 404 |
| POST/DELETE | `/admin/incidentes/:id/seguir` | agente | seguir / dejar de seguir (cualquier agente puede seguir un caso) | 200 `{siguiendo, seguidores, asignado}` | 401, 403, 404 |
| GET | `/admin/incidentes/:id/historial`, `/admin/agentes` | agente | eventos con actor / lista de agentes | 200 | 401, 403, 404 |
| GET | `/admin/mi-cola?vista=mios\|siguiendo&...` | agente | `mios` = lo reclamado, `siguiendo` = lo seguido que no es mío (sin `vista`: unión) | 200 `{data,total,page,limit,vista}` | 400, 401, 403 |

## 6. Base de datos (PostgreSQL 15)

Tablas: `usuarios(id,nombre,email UNIQUE,password_hash,rol,creado_at)`,
`reservas(id,user_id→CASCADE,tipo,codigo,origen,destino,hotel,fechas,estado)`,
`incidentes(id,user_id→CASCADE,reserva_id→SET NULL,tipo,titulo,descripcion,prioridad,estado,
triado_por,triado_at,sla_vence_at,prioridad_sugerida,prioridad_motivo,asignado_a,creado_at,actualizado_at)`,
`respuestas(id,incidente_id→CASCADE,autor_id→CASCADE,mensaje)`,
`incidente_eventos(id,incidente_id→CASCADE,actor_id→SET NULL,accion,detalle,creado_at)`,
`incidente_seguidores(incidente_id,agente_id)` (PK compuesta),
`refresh_tokens(id,usuario_id→CASCADE,token_hash UNIQUE,expira_at,revocado_at,creado_at)`.
Relaciones: usuarios 1:N reservas, 1:N incidentes, 1:N refresh tokens; reservas 1:N incidentes (opcional);
incidentes 1:N respuestas, 1:N eventos, N:M agentes (seguidores). Índices: `idx_reservas_user`,
`idx_incidentes_user`, `idx_incidentes_cola(estado,prioridad,creado_at)`, `idx_incidentes_asignado`,
`idx_respuestas_incidente`, `idx_eventos_incidente`, `idx_seguidores_agente`,
`idx_refresh_tokens_usuario`.

`db/schema.sql` es el schema v4 completo (base nueva = `schema.sql` + `seeds.sql`).
`db/migrate_05_admin_auditoria.sql` (rol `admin` + `usuarios_auditoria` + trigger) y
`db/migrate_06_seed_demo_grande.sql` (datos de demo) suben una base con un schema anterior.

| Rutina | Tipo | Finalidad real |
|---|---|---|
| `touch_actualizado_at()` + trigger `trg_incidentes_touch` | trigger function | Mantiene `actualizado_at` automáticamente |
| `crear_respuesta(INT,INT,TEXT)→INT` | function | Inserta respuesta + `EnGestion` en una transacción; la usa `AdminController` |
| `resumen_cola()` | function STABLE | Conteos por estado/prioridad para el panel |
| `sembrar_demo()` | PROCEDURE | Seed idempotente (2 admins + 4 agentes + 6 viajeros + reservas + incidentes + respuestas); `seeds.sql` = `CALL` |
| `chequear_agente_asignado()` + trigger `trg_incidentes_agente` | trigger function | Un caso solo puede asignarse a un agente o admin |
| `upsert_usuario/reserva/incidente/respuesta()` | functions | Helpers idempotentes del seed |

Credenciales demo (solo desarrollo): ver `datos.md` en la raiz del repo (hashes bcrypt en BD).

## 7. Autenticación y seguridad

- Hash: `password_hash(PASSWORD_BCRYPT, cost 10-12)`, salt automático, `password_verify`.
- JWT HS256 manual (`hash_hmac`+`hash_equals`): claims `{sub,rol,iat,exp}`, `exp=8h`
  (`JWT_TTL_HOURS` 1-24), sin passwords ni secretos en el payload; secreto ≥32 bytes en `.env`.
- Refresh token opaco (32 bytes random, `REFRESH_TTL_DAYS` 1-90): la BD guarda solo su SHA-256,
  rota en cada uso y `POST /logout` lo revoca.
- Móvil: token en SecureStore (`auth.js` con adaptador memoria testeable); `api.js` adjunta
  Bearer a todas las peticiones, renueva la sesión con `/refresh` ante un 401 y reintenta la
  petición; si el refresh falla, dispara `onUnauthorized`→logout.
- Autorización: `requireRole` por endpoint, con el rol revalidado contra la BD en cada request
  (degradar una cuenta corta el acceso al instante); viajero filtrado por `user_id=sub`;
  401 genérico en login (no revela si el email existe); `reserva_id` validada como propia.
- Entradas: whitelist de valores/longitudes, `PDO::prepare` en todo, `CHECK`s a nivel BD como
  defensa en profundidad, `limit≤50`, `Content-Type: application/json`, errores sin traces/SQL.

## 8. Apps móviles

Viajero (`despegar-viajero`): Login, Registro, Viajes (pull-refresh, vacío, reintentar),
Reportar (tipo+reserva opcional, contadores, `Alert` de confirmación, éxito con n°),
Incidentes (filtros, badges) y Detalle con hilo. Navegación por tabs + detalle apilado.
Agente (`despegar-agente`): Login corporativo (rechaza no-agente, sin registro), Cola
(resumen, filtros, orden asc/desc, paginación, highlight Crítica) y Gestión (PUT
prioridad/estado con confirmación en Resuelto, responder, hilo).
Cola por pestañas `[Activos | Sin triar | Míos | Siguiendo | Resueltos]`: "Míos" son los casos
**reclamados** (`mi-cola?vista=mios`), "Siguiendo" los que el agente **sigue** y no son suyos
(`mi-cola?vista=siguiendo`); seguir es libre (cualquier agente puede seguir un caso aunque otro
lo tenga). Cada card muestra quién lo reclamó (`asignado_nombre`), si lo seguís y cuántos lo
siguen; el detalle expone `asignado`, `seguidores`, `siguiendo` y `mi_asignado`.

Compartido (`apps/shared`): `theme` (violeta `#6C2BD9`/`#4A1FA3`, fondo `#F6F5FB`,
semántica prioridad/estado, spacing base 8, radius 12/16, type 24/18/16/14, táctil 48),
`api` (Bearer automático, timeout 8s, renovación con `/refresh` ante 401, logout si el refresh falla),
`auth` (SecureStore con adaptador de memoria testeable, guarda access + refresh),
`components` (Button/Input/Banner/Badge/Empty/Loading/**FormScrollView**/**ApiWarning**),
`format` (etiquetas, estados, prioridades, fechas `es-AR`). Navegación condicional sin React
Navigation; `metro.config.js` con `watchFolders` para `../shared`; `app.json` por app.

`FormScrollView` mide la altura del teclado y la suma como padding, de modo que el input
enfocado nunca queda tapado por el teclado del celular (iOS: `KeyboardAvoidingView`;
Android: el padding). Se usa en login, registro, reportar incidente y detalle de gestión.

La URL de la API se incrusta en el bundle al compilar (`EXPO_PUBLIC_API_URL`): los `.cmd` de
arranque la escriben en `apps/<app>/.env` (gitignored) desde `deploy/api-url.txt` (nube) o
desde la IP LAN detectada (`start-*.cmd local`). Cambiar la URL exige reiniciar Metro.
Si falta `EXPO_PUBLIC_API_URL`, la app lo avisa en pantalla (`ApiWarning`): `localhost`
no sirve desde un celular.

## 9. Testing

Automático (requieren API en `:8000`): `tests/api_f2_auth.ps1` (15 checks: registro,
409/400, login, 401, SQLi, me, tokens, no-leak, refresh), `tests/api_f3_dominio.ps1` (20 checks:
aislamiento, ownership, cola, filtros, responder, PUT, 403/404), `tests/api_f7_integracion.ps1`
(expirado→401 + loop completo) con `tests/mint_expired.php`, `tests/api_f8_gestion.ps1`
(sugerencia/SLA/claim/derivar/seguir/historial). Resultado de referencia: **58/58 en verde** (F2 15 · F3 20 · F7 3 · F8 20).
Sin API: `tests/api_client_refresh.test.mjs` (`node --test`, 4 checks del cliente móvil:
renovación de sesión, header Bearer, aviso de URL).
La password del rol local la toma `backend/.env` (no está hardcodeada en los tests).
Estructura UI: checker de balance JSX (`jsx_check.py`, 14/14) + test Node de `auth`/`api`
(roundtrip SecureStore, 401→callback). Manual: checklist Expo Go en `README.md`.

## 10. Git

Remoto: `github.com/ynnxx23/Despegar` (público). Identidad `Grupo Despegar`, commits
`docs/feat/test/fix/chore/refactor`. `.gitignore` cubre `.env` y `.env.*` (salvo
`.env.example`), `node_modules/`, `.expo/`, `.vscode/`. `backend/.env` y `apps/*/.env` jamás
trackeados (verificado con `ls-files`); los secretos que se publicaron se rotaron.
La línea de trabajo del grupo vive en `feature/railway-deploy`; `main` conserva la versión
anterior del proyecto.

## 11. Entorno y despliegue

Servicios: PostgreSQL x64 15 `:5432` (rol `despegar` con password propia, solo en `backend/.env`, BD `despegar`;
superusuario local con password propia), API `php -S 0.0.0.0:8000 -t backend/public`
(`0.0.0.0` para alcance LAN; requiere `pdo_pgsql` en `php.ini`), apps con
`EXPO_PUBLIC_API_URL` (nube: `deploy/api-url.txt`; local: IP LAN; `10.0.2.2` en emulador
Android). Variables `.env`: `DB_HOST/PORT/NAME/USER/PASS`,
`JWT_SECRET`, `BCRYPT_COST`, `JWT_TTL_HOURS`, `REFRESH_TTL_DAYS`, `APP_ENV`, `CORS_ORIGIN`.
Comandos BD en `README.md`.

Red required en el celular: misma LAN que la PC, firewall con reglas TCP `8000` y
`8081-8082` entrantes y perfil de red "Privada". La IP LAN es dinámica por DHCP, así que
`start-viajero.cmd` / `start-agente.cmd` reescriben `apps/*/.env` (`EXPO_PUBLIC_API_URL`)
con la IP vigente antes de arrancar Metro; la URL queda incrustada en el bundle, por lo que
cambiar la IP implica reiniciar Metro (o recargar la app). El cliente HTTP compartido
corta cada request a 8 s: sin ese timeout un paquete descartado dejaba la UI en
"Conectando…" indefinidamente (RN no aplica timeout por defecto).

### Despliegue en la nube (Railway)
La API también corre en Railway (servicio `api` con `Dockerfile` + plugin Postgres), de modo que
las apps funcionan sin la PC encendida y sin compartir Wi-Fi: `https://api-production-88975.up.railway.app/api`.
Variables del servicio: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (la parsea
`backend/src/Database.php` cuando no hay `DB_*`), `JWT_SECRET` (>= 32 chars, obligatorio),
`CORS_ORIGIN` (vacío = sin cabeceras CORS; las apps nativas no las necesitan),
`APP_ENV`, `REFRESH_TTL_DAYS` y
`PORT` (inyectado por Railway; el `Dockerfile` escucha ahí y usa `PHP_CLI_SERVER_WORKERS=8`
porque el server embebido de PHP es single-thread). La BD se inicializa una vez por túnel SSH
(`railway connect Postgres --tunnel-only`) con `deploy/init-db.ps1`
(`db/schema.sql` es destructivo: solo sobre base vacía). Las apps eligen la URL según
`deploy/api-url.txt` (nube) o el argumento `local` de los `.cmd` (backend local).
Entre demostraciones la API se pausa para dejar de facturar:
`deploy/railway-pause.ps1` (apaga el healthcheck y baja el deployment) y
`deploy/railway-resume.ps1` (la vuelve a levantar y espera el health).
Procedimiento completo en `docs/railway.md`.

## 12. Decisiones técnicas

PHP puro sin framework (evalúa POO/PDO, despliegue simple) · JWT manual sin
`firebase/php-jwt` (cero dependencias) · PostgreSQL por rutinas del integrador ·
funciones + 1 procedimiento, cada objeto con uso real · dos apps separadas (aíslan permisos)
· `fetch` en vez de Axios · refresh token propio (opaco, hasheado en BD y rotado en cada uso)
en vez de re-loguear cada 8h · Docker solo opcional ·
texto plano en UI (sin emojis) · fuente del sistema (sin peso extra).

## 13. Limitaciones conocidas

- Runtime Expo Go en dispositivo (sin build nativa ni EAS en el flujo de demo).
- `docker compose up` queda como opción local; en la nube el deploy es Railway (`Dockerfile`).
- CORS abierto solo si se configura `CORS_ORIGIN=*` (por defecto no se manda ninguna cabecera);
  credenciales demo publicadas en el repo (cambiar antes de exponer).
- La API en Railway es pública: cualquiera con una cuenta demo puede entrar. Rotar las
  credenciales demo o restringir acceso antes de una presentación.
- La base de datos de la nube es **compartida**: todas las apps y equipos ven los mismos casos.
- La API encendida 24/7 consume créditos de Railway: entre demostraciones conviene pausarla
  (`deploy/railway-pause.ps1`). El Postgres sigue facturando RAM + volumen aunque la API esté
  pausada.
- La URL de la API se incrusta en el bundle: cambiar la IP o el dominio exige reiniciar Metro.
- El historial de git conserva valores de `.env` que estuvieron publicados: por eso la
  `JWT_SECRET` y la password del rol local se rotaron (rotar es suficiente; no se reescribió
  el historial).
- `password` del superusuario PG local documentada en el historial del proyecto.
