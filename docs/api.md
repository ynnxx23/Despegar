# API — Sistema central (backend)

> Alcance: solo backend + base de datos. Visión general en `../DOC_PROYECTO.md`.
> Detalle técnico completo en `../DOC_DESARROLLO.md`. Apps: `app-viajero.md`, `app-agente.md`.

## 1. Stack y entrada

- PHP 8.2 POO + PDO `pgsql`, sin framework. Único punto de entrada: `backend/public/index.php`.
- Base de datos PostgreSQL 15 (imagen Docker 16). Schema + seeds en `db/`.
- Requiere extensión `pdo_pgsql` activa en `php.ini`.

Estructura:

```
backend/
  public/index.php          # router (tabla de rutas) + CORS + headers + handler global (única entrada)
  .env / .env.example       # secretos (.env gitignored, jamás commitear)
  src/Config.php            # lee .env sin librerías
  src/Database.php          # singleton PDO (ERRMODE_EXCEPTION, EMULATE_PREPARES=false)
                             #   admite DB_* (local) o DATABASE_URL (Railway)
  src/Utils/JwtHS256.php    # JWT HS256 manual (hash_hmac + hash_equals)
  src/Utils/Response.php    # JSON uniforme {data} / {error:{code,message,details?}}
  src/Utils/Cors.php        # CORS segun CORS_ORIGIN (vacio = sin cabeceras)
  src/Utils/Security.php    # headers de seguridad (nosniff, frame, CSP, HSTS)
  src/Utils/RateLimit.php   # cuotas por IP/cuenta (archivo + flock): login, register, refresh
  src/Utils/Router.php      # tabla de rutas: patron con {param}, roles, 405 + header Allow
  src/Middleware/Auth.php   # Bearer + requireRole (401/403) + rol revalidado contra la BD
  src/Models/               # Usuario, Reserva, Incidente, GestionCaso, Respuesta,
                             #   RefreshToken, Auditoria (solo SQL preparado)
  src/Controllers/          # Auth, Itinerario, Incidentes (viajero), Admin (agente),
                             #   AdminUsuarios (admin)
db/
  schema.sql                # schema v4: tablas + triggers + funciones + \ir seed_demo.sql
                            # touch_actualizado_at(), crear_respuesta(), resumen_cola()
                            # + procedimiento sembrar_demo() (definido en seed_demo.sql)
  seed_demo.sql             # definicion del procedimiento sembrar_demo() (idempotente)
  seeds.sql                 # CALL sembrar_demo() (idempotente)
  migrate_0*.sql            # solo para subir una base creada con un schema anterior
```

Roles: `viajero` | `agente` | `admin`. El `admin` administra usuarios y agentes
(panel `/api/admin/usuarios`); el `agente` atiende casos.

## 2. Levantar en local

```powershell
# 1. Rol/BD (una vez, con TU password: no se versiona)
createuser -U postgres -d despegar -P
createdb -U postgres -O despegar despegar
# 2. Schema + seeds (base nueva: el schema ya trae todo)
psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql
# 3. Env
copy backend\.env.example backend\.env   # ajustar JWT_SECRET (>=32 bytes)
# 4. Servir (0.0.0.0 para alcance LAN desde el celular)
php -S 0.0.0.0:8000 -t backend/public
# 5. Verificar
# GET http://localhost:8000/api/health -> {ok,service,version,roles}
```

Opción Docker (opcional): `docker compose up --build` → API `:8000`, PostgreSQL `:5432`.

Variables `.env` (`backend/.env.example`): `DB_HOST/PORT/NAME/USER/PASS`,
`JWT_SECRET`, `BCRYPT_COST` (10-12), `JWT_TTL_HOURS` (1-24, defecto 8),
`REFRESH_TTL_DAYS` (1-90, defecto 30), `APP_ENV` (development|production),
`CORS_ORIGIN` (vacío = sin CORS, `*` = cualquiera, o lista de orígenes separados por coma).

## 3. Auth

- Registro público solo rol `viajero`. Cuentas `agente` las crea el equipo.
- Login responde 401 genérico (no revela si el email existe).
- JWT HS256 claims `{sub,rol,iat,exp}`, expira 8h. Header: `Authorization: Bearer <jwt>`.
- `Auth::requireRole($db, [...])`: 401 sin/inválido/expirado, 403 rol insuficiente o recurso ajeno.
  El rol se revalida contra la BD en cada request: degradar una cuenta en `usuarios.rol`
  corta el acceso en el acto, sin esperar a que expire el token.
- Contraseñas: `password_hash(BCRYPT)` + `password_verify`, nunca se devuelven (`toSafe`).
- Refresh token: opaco (32 bytes random), la BD guarda solo su SHA-256. Vive 30 días
  (`REFRESH_TTL_DAYS`), se rota en cada uso (el anterior queda revocado) y `POST /logout`
  lo revoca. El access token va en el header; el refresh, en el cuerpo.

## 4. Endpoints (base `/api`, JSON)

| Método | Ruta | Rol | Body / params | Éxito | Errores |
|---|---|---|---|---|---|
| GET | `/health` | — | — | 200 `{ok,service,version,roles}` | — |
| POST | `/register` | público | `{nombre 2-100, email, password 8-72}` | 201 `{user,token,refresh_token}` (rol `viajero`) | 400, 409 |
| POST | `/login` | público | `{email,password}` | 200 `{user,token,refresh_token}` | 400, 401 |
| POST | `/refresh` | público | `{refresh_token}` (rota el refresh: el usado queda revocado) | 200 `{user,token,refresh_token}` | 401 |
| POST | `/logout` | público | `{refresh_token}` (opcional) | 200 `{data:{ok:true}}` | — |
| GET | `/me` | auth | — | 200 `{user}` | 401 |
| GET | `/itinerario` | viajero | — | 200 `{data:[reservas]}` | 401, 403 |
| GET | `/incidentes/mios?estado=` | viajero | filtro opcional | 200 `{data}` | 400, 401, 403 |
| POST | `/incidentes` | viajero | `{reserva_id?, tipo, titulo 5-120, descripcion 10-2000}` (`reserva_id` debe ser propia). Tipos: `Vuelo_cancelado, Vuelo_retrasado, Hotel_sin_reserva, Equipaje, Cobro_indebido, Fraude, Otro`. Al crear se calcula `prioridad_sugerida` (base: Fraude=Critica; Vuelo_cancelado/Hotel_sin_reserva/Equipaje/Cobro_indebido=Alta; Vuelo_retrasado/Otro=Baja; +1 nivel máx Critica si hay `urgente,varad,hoy,ahora,estafa,menor,salud,hospital,embarazada,discapacidad`) + `prioridad_motivo`; el viajero nunca ve `prioridad` real | 201 (Abierto, evento `creado`) | 400, 401, 403, 404 |
| GET | `/incidentes/:id` | dueño o agente | dueño ve `{atendido_por, historial:[{texto,creado_at}]}` público (solo claim/responder/estado/resuelto/reabierto, sin motivos internos); agente ve incidente+usuario+reserva | 200 | 401, 403, 404 |
| GET | `/incidentes/:id/respuestas` | dueño o agente | — | 200 `{data:[hilo]}` | 401, 403, 404 |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc\|urgencia&page=&limit=` | agente | `orden=urgencia` (defecto): vencidos SLA primero, luego sin triar (`prioridad` NULL), luego Critica/Alta/Baja, luego creado ASC (`sla` NULLS LAST). Cada caso trae `asignado_a`, `asignado_nombre` (quién lo reclamó), `siguiendo` (lo sigo yo) y `seguidores_count` | 200 `{data,total,page,limit}` | 400, 401, 403 |
| GET | `/admin/incidentes/resumen` | agente | — | 200 `{data:[{estado,prioridad,total}], sin_triar, vencidos, mios}` vía `resumen_cola()` + conteos | 401, 403 |
| GET/PUT | `/admin/incidentes/:id` | agente | GET devuelve `{incidente, usuario, reserva, asignado, seguidores, siguiendo, mi_asignado}`; PUT parcial `{prioridad?,estado?}` = triaje: fija `triado_por/at`, `sla_vence_at = now + SLA` (Critica 4h, Alta 24h, Baja 72h); Resuelto exige prioridad (400 si no) | 200 | 400, 401, 403, 404 |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | POST `{mensaje 2-2000}` (pasa a EnGestion, atómico vía `crear_respuesta()`; evento `responder`) | GET 200 / POST 201 | 400, 401, 403, 404 |
| POST | `/admin/incidentes/:id/claim` | agente | Toma el caso (`asignado_a=yo`, Abierto→EnGestion, evento `claim`); 409 si asignado a otro; idempotente si ya es mío | 200 | 401, 403, 404, 409 |
| POST | `/admin/incidentes/:id/release` | agente | Libera (`asignado_a=NULL`, evento `release`) | 200 | 401, 403, 404 |
| POST | `/admin/incidentes/:id/derivar` | agente | `{agente_id, motivo?}` (destino rol agente, 404 si no; 400 si es el actual; evento `derivar`) | 200 | 400, 401, 403, 404 |
| POST/DELETE | `/admin/incidentes/:id/seguir` | agente | Seguir / dejar de seguir (idempotentes; eventos `seguir`/`dejar_seguir`). **Cualquier agente puede seguir un caso, tenga o no el caso asignado**. Devuelve `{incidente_id, siguiendo, seguidores, asignado}` | 200 | 401, 403, 404 |
| GET | `/admin/incidentes/:id/historial` | agente | Eventos con `actor_nombre` (`creado,claim,release,derivar,seguir,dejar_seguir,responder,estado,prioridad,triaje,resuelto,reabierto`) | 200 | 401, 403, 404 |
| GET | `/admin/agentes` | agente | — | 200 `{data:[{id,nombre,email}]}` | 401, 403 |
| GET | `/admin/mi-cola?vista=mios\|siguiendo&estado=&prioridad=&orden=urgencia&page=&limit=` | agente | `vista=mios` = casos que reclamé; `vista=siguiendo` = los que sigo y no son míos; sin `vista` = unión (asignados + seguidos). Excluye Resueltos salvo `?estado=Resuelto`; misma paginación | 200 | 400, 401, 403 |
| GET | `/admin/usuarios?rol=&q=&page=&limit=` | admin | Lista usuarios (rol `viajero`/`agente`/`admin`, búsqueda por nombre/email). Cada fila trae `incidentes`, `asignados`, `activo` | 200 `{data,total,page,limit}` | 400, 401, 403 |
| POST | `/admin/usuarios` | admin | Alta de usuario `{nombre 2-100, email, password 8-72, rol}` (por ejemplo, un agente nuevo). Queda registrado en la auditoría | 201 `{data}` | 400, 401, 403, 409 |
| PUT | `/admin/usuarios/:id` | admin | Cambios administrativos: `{rol?, activo?, password?, motivo?}`. No permite cambiarse el propio rol ni desactivar la propia cuenta (400) ni dejar la base sin admins (409) | 200 `{data}` | 400, 401, 403, 404, 409 |
| GET | `/admin/usuarios/:id/historial` | admin | Historial de cambios de ese usuario (actor, campo, valor anterior → nuevo, motivo) | 200 `{data,usuario}` | 401, 403, 404 |
| GET | `/admin/historial?usuario_id=&limit=` | admin | Feed global de cambios de usuarios (más reciente primero) | 200 `{data}` | 401, 403 |

Códigos: 400 validación, 401 sin token/inválido/expirado, 403 rol o recurso ajeno,
404 inexistente, 405 método no permitido (con header `Allow`), 409 email duplicado o caso asignado a otro (claim),
429 cuota de peticiones excedida (`Retry-After`), 500 genérico (detalle solo en `error_log`).

Versionado: `/api/v1/...` es un alias de `/api/...` (mismo router, mismo comportamiento). Un
path que no existe devuelve **404**; un path que existe con otro método devuelve **405** con el
header `Allow` (ejemplos: `POST /api/me` → `Allow: GET`).

Contrato completo en OpenAPI 3.0: [`openapi.yaml`](openapi.yaml) (esquemas, parámetros y todos
los códigos de error de cada endpoint).

## 4b. Flujo triage/SLA/claim

1. Viajero crea → `prioridad` NULL (sin triar) + `prioridad_sugerida`/`prioridad_motivo` + evento `creado`.
2. Agente filtra cola con `orden=urgencia` o abre `mi-cola`; `resumen` muestra `sin_triar/vencidos/mios`.
3. Agente `claim` (o `derivar`/`seguir`) → `atendido_por` visible al viajero + evento.
4. Agente tria con `PUT prioridad` → `triado_por/at` + `sla_vence_at = now + SLA` (4/24/72h) + eventos `prioridad`/`triaje`.
5. Agente responde / cambia estado → eventos `responder`/`estado`/`resuelto`/`reabierto`; el viajero solo ve historial público.
6. Cierre exige prioridad: `PUT estado=Resuelto` sin prioridad (real o en body) → 400.

## 5. Base de datos (resumen operativo)

Tablas: `usuarios`, `reservas` (FK `user_id` CASCADE), `incidentes`
(FK `user_id` CASCADE, `reserva_id` SET NULL, `asignado_a` SET NULL, `triado_por` SET NULL;
`prioridad` nullable hasta el triage), `respuestas` (FK `incidente_id`/`autor_id` CASCADE),
`incidente_eventos` (FK `incidente_id` CASCADE, `actor_id` SET NULL; índice `(incidente_id,creado_at)`),
`incidente_seguidores` (PK compuesta + índice `(agente_id)`),
`refresh_tokens` (FK `usuario_id` CASCADE, `token_hash` UNIQUE, `expira_at`, `revocado_at`),
`usuarios_auditoria` (FK `usuario_id`/`actor_id` SET NULL; accion, campo, valor_anterior, valor_nuevo, detalle): historial de cambios de usuarios (actor + valores).
Valores cerrados con `CHECK`:
rol (3: `viajero`, `agente`, `admin`), tipo (7: `Vuelo_cancelado,Vuelo_retrasado,Hotel_sin_reserva,Equipaje,Cobro_indebido,Fraude,Otro`), prioridad (Baja/Alta/Critica — sin tilde en BD), estado
(Abierto/EnGestion/Resuelto — `crear_respuesta()` escribe `EnGestion`).

Rutinas con uso real: trigger `trg_incidentes_touch` (`actualizado_at` automático),
`crear_respuesta()` (respuesta + cambio de estado en una transacción),
`resumen_cola()` (conteos del panel), `sembrar_demo()` (seed idempotente).
Trigger `trg_incidentes_agente` (`chequear_agente_asignado()`): un caso solo puede
asignarse a un agente o a un admin.

`db/schema.sql` es el schema v4 completo: una base nueva se crea con `schema.sql` + `seeds.sql`.
`db/migrate_05_admin_auditoria.sql` (rol `admin`, `usuarios_auditoria`, índices, trigger) y
`db/migrate_06_seed_demo_grande.sql` (datos de demo) suben una base creada con un schema
anterior. Todas las migraciones son idempotentes.

Credenciales demo (solo desarrollo): ver `datos.md` en la raiz del repo (admins, agentes y viajeros).

## 6. Tests

Requieren API en `:8000` y la BD local (la password del rol sale de `backend/.env`):

```powershell
powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1        # auth/roles/SQLi/refresh (15 checks)
powershell -ExecutionPolicy Bypass -File tests/api_f3_dominio.ps1     # dominio/cola/403 (20 checks)
powershell -ExecutionPolicy Bypass -File tests/api_f7_integracion.ps1 # expirado->401 + loop viajero->agente->viajero
powershell -ExecutionPolicy Bypass -File tests/api_f8_gestion.ps1     # gestion: sugerencia/SLA/claim/derivar/seguir/historial
node --test tests/api.test.mjs                                        # suite portable (Node, 16 checks)
node --test tests/api_client_refresh.test.mjs                        # cliente movil: refresh/Bearer/aviso de URL (4 checks)
```

`tests/api.test.mjs` corre en cualquier sistema (no necesita PowerShell) y es lo que
ejecuta el CI (`.github/workflows/ci.yml`): levanta PostgreSQL, aplica el schema,
levanta la API y corre las dos suites de Node. Cubre: health + alias `/api/v1`, register
201/409, login 200/401, SQLi 401, `/me` 401/200, token manipulado 401, refresh de un solo uso
(el canjeado no se reusa), 404 de endpoint inexistente, 405 con header `Allow`, 403 del viajero
y del agente en los paneles de admin, panel de usuarios del admin (listar, crear 201, promover
y el historial del cambio), auto-guard del admin (400) y revalidación del rol contra la BD
(el token de un agente deja de servir si lo degradan: 403). Base configurable con `API_BASE`
(por defecto `http://127.0.0.1:8000`): si la API no está levantada, la suite falla con el
comando exacto para levantarla. El 429 no se ejercita a propósito (quedaría la cuota de la
IP agotada para el resto de las pruebas).

Referencia: **58/58 en verde** (F2 15 · F3 20 · F7 3 · F8 20) más 4 del cliente móvil
y la suite portable de Node.
`tests/mint_expired.php` genera JWT expirado para F7.

## 7. Seguridad y límites

- `PDO::prepare` en todo, `CHECK`s como defensa en profundidad, errores sin traces/SQL
  (handler global: 500 genérico + `error_log`).
- Headers de seguridad en todas las respuestas: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy`
  y `Strict-Transport-Security` cuando la conexión es HTTPS.
- Cuotas de peticiones (`RateLimit`, archivo + `flock` porque el server embebido corre
  varios workers): login (por IP y por cuenta), registro (por IP) y refresh. Al superarlas
  la API responde **429** con `Retry-After`. Los límites se ajustan con `LOGIN_RATE_LIMIT`,
  `LOGIN_RATE_ACCOUNT_LIMIT`, `REGISTER_RATE_LIMIT` y `REFRESH_RATE_LIMIT` (en `.env`).
- Un `admin` no puede cambiar su propio rol ni desactivar su cuenta, y no se puede dejar
  la base sin ningún administrador activo. Cada cambio queda en `usuarios_auditoria`.
- CORS configurable con `CORS_ORIGIN`: vacío (defecto) no manda ninguna cabecera CORS,
  `*` deja pasar cualquier origen (solo dev: con `APP_ENV=production` queda logged como aviso)
  y una lista separada por comas es la allowlist. Secretos solo en `.env`: el `.gitignore` cubre `.env` y `.env.*`
  (salvo `.env.example`, que va con placeholders). La `JWT_SECRET` y la password del rol
  local se rotaron cuando se detectaron publicadas; cada developer genera las suyas.
- La API en Railway expone la URL pública: el login y los errores del cliente HTTP no
  muestran la URL del servidor, y cada request corta a los 8 s.
- El rol se revalida contra la BD en cada request: degradar una cuenta corta el acceso
  al instante. El refresh token se guarda solo hasheado y rota en cada uso.
- Sin framework a propósito (evalúa POO/PDO).
