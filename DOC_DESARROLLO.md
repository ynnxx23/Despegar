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
| Entorno local | PHP 8.2 CLI (XAMPP) + PostgreSQL :5432 | pdo_pgsql activo |
| Utilidades | Node 24, PowerShell 5.1, Git 2.51 | Scripts de test en `.ps1` |
| Docker | Compose (opcional) | php:8.2-apache, postgres:16 |

Dependencia móvil justificada: `expo-secure-store` (requisito TRANS-70, token seguro).
`@expo/vector-icons` NO se usa (iconografía con texto; ver §13).

## 2. Estructura del repositorio

```
despegar/
  DOC_PROYECTO.md / DOC_DESARROLLO.md / PLAN_DESARROLLO_DESPEGAR.md / README.md
  backend/
    public/index.php          # único punto de entrada (router + CORS + init, ~40 rutas)
    .env / .env.example       # secretos (.env gitignored, ver §11)
    db_migrate.php            # runner de migraciones (schema_migrations, idempotente)
    src/Config.php            # lee .env sin librerías
    src/Database.php          # singleton PDO pgsql
    src/Utils/JwtHS256.php    # JWT HS256 manual (hash_hmac + hash_equals, jti+iss)
    src/Utils/Response.php    # JSON uniforme + code_str/request_id
    src/Utils/Logger.php      # log JSON estructurado con request-id
    src/Utils/RateLimit.php   # rate-limit login (10/min) y escritura (120/min)
    src/Utils/IaHeuristica.php# score urgencia + copiloto + resumen + traducción
    src/Utils/AuditoriaHash.php # hash encadenado de eventos
    src/Utils/Ocr.php         # tesseract real + fallback heurístico
    src/Utils/Stt.php         # Whisper real + stub honesto
    src/Utils/Push.php        # multicanal log/email/FCM/WhatsApp
    src/Middleware/Auth.php   # Bearer + requireRole (401/403, bloquea borradas/inactivas)
    src/Models/              # Usuario, Reserva, Incidente, Respuesta, Notificacion
    src/Controllers/         # Auth, Itinerario, Incidentes, Admin, Adjuntos,
                             # Notificaciones, Ia, Chatbot
  db/schema.sql              # tablas base + trigger + 3 funciones + 1 procedimiento
  db/seeds.sql               # CALL sembrar_demo() (idempotente)
  db/migrate_02..07          # triaje, gestión, completa, fase4, sesiones/GDPR, equipo/reset
  apps/
    shared/                  # theme, api (+refresh), auth (+refresh/offline), components,
                             # format, constants, notificaciones, offlineQueue,
                             # NotificacionesScreen, PasswordReset
    viajero/                 # app.json, metro.config.js, package.json, App.js, screens/ (7)
    agente/                  # idem (sin registro, 3 screens)
  tests/                     # api_f2,f3,f7,f8,f9,f10,f11,f12,f13 (.ps1) + e2e Maestro + mint_expired.php
  .github/workflows/api.yml  # CI: lint PHP + migrates + health
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
| Tokens de diseño | `theme.colors|spacing|radius|type` | `theme.colors.primary` (`#4300D2` EVA) |
| Secrets | solo `backend/.env`, jamás en código | `.env.example` con placeholders |

Reglas: sin tildes en identificadores de BD/API (`Critica`, no `Crítica`; en UI sí);
paginación `limit` 1-50; fechas ISO; sin `console.log` con datos sensibles.

## 4. Backend

Flujo por request: `index.php` (headers seguridad + CORS allowlist/OPTIONS → `bodyJson()` →
`Database::pdo()` → rate-limit escritura) → rutas exactas o regex `^/api/...(\d+)...$` →
`Auth::requireRole([...])` → Controller → `Response::json/error` (con `exit` + `X-Request-Id`).
Handler global convierte excepciones en 500 JSON sin traces. `Auth::bearer()` acepta
`HTTP_AUTHORIZATION`, `REDIRECT_HTTP_AUTHORIZATION` y `getallheaders()`.

| Clase | Rol |
|---|---|
| `Config` | env con defaults seguros |
| `Database` | PDO `pgsql:host;port;dbname`, `ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false` |
| `JwtHS256` | `encode/decode`; exige `alg=HS256`, firma `hash_equals`, `exp>now`, `jti+iss` |
| `Logger` / `RateLimit` | log JSON con request-id; límites login 10/min y escritura 120/min (429) |
| `Auth` | extrae Bearer; 401 sin/inválido/expirado; 403 rol; bloquea borradas/inactivas |
| `Usuario` | `findByEmail/findById/create`, BCRYPT 10-12, `toSafe` (sin hash, con `email_verificado`) |
| `Reserva` | `listByUser` (solo propias), `belongsTo` (propiedad) |
| `Incidente` | CRUD + `listAll` (filtros estado/prioridad/tipo/q/orden/paginación) + `countAll`; `norm()` castea ints; `sugerirPrioridad`, `slaHoras` (tabla configurable), `transicionValida`, eventos con IP/UA + hash |
| `Respuesta` | `listByIncidente` (públicas/internas, paginado) + `responderAtomico` (no reabre finales) + `responderConReapertura` |
| `Notificacion` | crear/listar/contar + `avisarCaso` (dueño+asignado+seguidores) + push multicanal |
| `IaHeuristica` | score 0-1 + copiloto + resumen extractivo + traducción básica |
| `AuditoriaHash` / `Ocr` / `Stt` / `Push` | hash encadenado; tesseract+fallback; Whisper+stub; log/email/FCM/WhatsApp |
| `AuthController` | `register/login` (par token+refresh) + `refresh` (rotación) + `logout` + `me` + `borrarCuenta` (GDPR) + email solicitar/verificar + password solicitar/restablecer |
| `ItinerarioController` | `show` (viajero) |
| `IncidentesController` | `mios` (paginado+q) / `crear` (idempotencia) / `ver` / `respuestas` (solo públicas) / `responderViajero` / `reabrir` |
| `AdminController` | `cola` (q/tipo) / `miCola` / `ver` / `actualizar` (transición válida) / `responder` (interna opcional) / `resumen` / `claim-release-derivar-seguir` (transaccionales) / `historial` / `agentes`+alta+estado / `bulk` / `merge` / `metricas`+CSV / `slaRiesgo`+`slaRevisar` / `auditoriaVerificar` |
| `AdjuntosController` | `listar` / `subir` (base64 5MB jpg/png/pdf) / `ocr` (tesseract + autovínculo) |
| `NotificacionesController` / `IaController` / `ChatbotController` | `mias/contar/leer` / `triage/copiloto/resumen` / `borrador/stt` |

## 5. API — referencia

Base `/api`. Auth: `Authorization: Bearer <jwt>` (salvo register/login/health/refresh/password).
Documentación viva en `docs/api.md` + `docs/openapi.json` (v1.4.0).

| Método | Ruta | Rol | Body / params | Éxito | Errores |
|---|---|---|---|---|---|
| GET | `/health` | — | chequeo DB | 200 `{ok,service,db}` / 503 si DB caída | — |
| GET | `/openapi.json` | — | contrato | 200 | 404 |
| POST | `/register` | público | `{nombre 2-100, email, password 8-72}` | 201 `{user,token,refresh_token}` (viajero) | 400, 409 |
| POST | `/login` | público | `{email,password}` (rate-limit 10/min) | 200 `{user,token,refresh_token}` | 400, 401 |
| POST | `/refresh` | público | `{refresh_token}` con rotación | 200 par nuevo | 400, 401 |
| POST | `/logout` | auth | `{refresh_token?}` o `{todos:true}` | 200 | 401 |
| GET/DELETE | `/me` | auth | DELETE = borrado GDPR | 200 | 401 |
| POST | `/email/solicitar`, `/email/verificar` | auth | generar / `{token}` un uso | 200 | 400, 401 |
| POST | `/password/solicitar`, `/password/restablecer` | público | siempre 200 / `{token,password}` 1h un uso | 200 | 400 |
| GET | `/itinerario` | viajero | — | 200 `{data}` | 401, 403 |
| GET | `/incidentes/mios` | viajero | `?estado=&q=&page=&limit=` | 200 `{data,total,page,limit}` | 400, 401, 403 |
| POST | `/incidentes` | viajero | `{reserva_id?,tipo,titulo,descripcion}` + `Idempotency-Key` | 201 (200 si reintento) | 400, 401, 403, 404 |
| GET | `/incidentes/:id` | dueño/agente | historial público para dueño | 200 | 401, 403, 404 |
| GET/POST | `/incidentes/:id/respuestas` | dueño/agente | viajero: solo públicas + puede responder (reabre) | 200/201 | 400, 401, 403, 404 |
| POST | `/incidentes/:id/reabrir` | viajero | Resuelto→EnGestion | 200 | 400, 401, 403, 404 |
| GET | `/incidentes/:id/resumen` | dueño/agente | `?lang=es\|en\|pt` | 200 | 401, 403, 404 |
| GET/POST | `/incidentes/:id/adjuntos` | dueño/agente | base64 jpg/png/pdf 5MB | 200/201 | 400, 401, 403, 404 |
| POST | `/incidentes/:id/adjuntos/:adj/ocr` | dueño/agente | OCR + autovínculo reserva | 200 | 401, 403, 404 |
| GET | `/admin/incidentes` | agente | `?estado=&prioridad=&tipo=&q=&orden=urgencia\|asc\|desc&page=&limit=` | 200 `{data,total,page,limit}` | 400, 401, 403 |
| GET | `/admin/mi-cola`, `/admin/incidentes/resumen` | agente | asignados+seguidos / conteos+sin_triar+vencidos+mios | 200 | 401, 403 |
| GET/PUT | `/admin/incidentes/:id` | agente | PUT valida transición; Resuelto exige prioridad | 200 | 400, 401, 403, 404 |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | `{mensaje,interna?}` | 200/201 | 400, 401, 403, 404 |
| POST | `/admin/incidentes/:id/claim|release|derivar|seguir` | agente | claim/release/derivar transaccionales | 200 | 400, 401, 403, 404, 409 |
| DELETE | `/admin/incidentes/:id/seguir` | agente | dejar de seguir | 200 | 401, 403, 404 |
| GET | `/admin/incidentes/:id/historial` | agente | paginado, con hash | 200 | 401, 403, 404 |
| GET | `/admin/incidentes/:id/ia`, `/admin/incidentes/:id/auditoria` | agente | score+explica / verifica hash | 200 | 401, 403, 404 |
| POST | `/admin/incidentes/:id/copiloto`, `.../merge` | agente | `{tono}` / `{duplicado_de}` | 200 | 400, 401, 403, 404 |
| POST | `/admin/incidentes/bulk` | agente | `{ids[1-50],accion,...}` | 200 `{ok,errores,total}` | 400, 401, 403 |
| GET/POST | `/admin/agentes`, `/admin/agentes/:id/estado` | agente | alta equipo / `{activo}` | 200/201 | 400, 401, 403, 404, 409 |
| GET | `/admin/metricas`, `/admin/metricas.csv`, `/admin/sla/riesgo` | agente | dashboard / CSV / vencen <6h | 200 | 401, 403 |
| POST | `/admin/sla/revisar` | agente | notifica vencidos | 200 | 401, 403 |
| GET/POST | `/notificaciones`, `/notificaciones/:id/leer`, `/notificaciones/leer-todas`, `/notificaciones/no-leidas` | auth | propias | 200 | 401, 404 |
| POST | `/chatbot/borrador`, `/stt/transcribir` | viajero/auth | borrador+faltantes / audio base64 | 200 | 400, 401 |
| GET | `/stream`, `/admin/stream` | auth | SSE snapshot no_leídas | 200 | 401 |

## 6. Base de datos (PostgreSQL 15)

Tablas: `usuarios(id,nombre,email UNIQUE,password_hash,rol,activo,email_verificado,email_token,reset_token,reset_expira,borrado_at)` (SELECT * en modelo),
`reservas(id,user_id→CASCADE,tipo,codigo UNIQUE,origen,destino,hotel,fechas,estado CHECK)`,
`incidentes(id,user_id→CASCADE,reserva_id→SET NULL,tipo 7,prioridad NULL-triaje,prioridad_sugerida/motivo,triado_por/at,sla_vence_at,asignado_a,ia_score/ia_explica,estado 7)`,
`respuestas(id,incidente_id→CASCADE,autor_id→CASCADE,mensaje,es_interna)`,
`incidente_eventos(+ip,user_agent,hash_prev,hash)`, `incidente_seguidores`,
`incidente_idempotencia`, `incidente_adjuntos(+ocr_texto,reserva_detectada)`,
`notificaciones`, `refresh_tokens`, `base_conocimiento`, `sla_politicas`, `schema_migrations`.
Índices: user, cola, respuestas, eventos, adjuntos, SLA, asignado, tipo, notifs, refresh.

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
- JWT HS256 manual (`hash_hmac`+`hash_equals`): claims `{sub,rol,iat,exp,iss,jti}`, `exp=8h`
  (`JWT_TTL_HOURS` 1-24), sin passwords ni secretos; secreto ≥32 bytes en `.env`.
- Sesiones: refresh opaco 30d (sha256 en BD) con rotación y revocación (una/todas);
  `api.js` reintenta 401 con refresh antes de logout. Cuentas desactivables y borrado GDPR
  (middleware y login bloquean tokens restantes).
- Reset: token 1h un solo uso, siempre 200 (no enumera), revoca sesiones al cambiar.
- Móvil: token+refresh en SecureStore; Bearer auto; `onUnauthorized`→logout solo si falla refresh.
- Autorización: `requireRole` por endpoint; ownership viajero; 401 genérico en login;
  `reserva_id` propia; transiciones de estado validadas; Resuelto exige prioridad.
- Entradas: whitelist, `PDO::prepare` en todo, `CHECK`s + transacciones `FOR UPDATE` en
  claim/derivar, `limit≤50`, rate-limit (login 10/min, escritura 120/min → 429),
  CORS allowlist + headers (`nosniff/DENY/HSTS`), errores `{code,code_str,request_id}` sin traces/SQL.

## 8. Apps móviles

Viajero (`despegar-viajero`): Login (con recupero), Registro, Viajes (pull-refresh),
Reportar (offline queue + idempotencia, confirmación, n° éxito), Incidentes (filtros,
búsqueda, badges) y Detalle (hilo, réplica, adjuntos+OCR, reabrir), Avisos, Ayuda
(asistente borrador) y Perfil (verificación email, sesiones, borrado GDPR).
Agente (`despegar-agente`): Login corporativo + recupero (rechaza no-agente, sin registro),
Cola (buscador, resumen, filtros tipo/estado/prioridad, orden urgencia/antiguos/recientes,
paginación, panel MTTR/riesgo) y Gestión (claim/release/derivar/seguir, PUT con transición
válida, copiloto IA, notas internas, Resuelto con confirmación, historial con hash).

Compartido (`apps/shared`): `theme` (tokens EVA reales `#4300D2`, pill 24, cards 8),
`api` (+refresh auto, `del`), `auth` (+refresh/offline), `components` (+Logo/Screen/Card/Chip),
`format`, `constants`, `notificaciones` (polling), `offlineQueue`, `NotificacionesScreen`,
`PasswordReset`. Navegación condicional sin React Navigation; `metro.config.js` con
`watchFolders`; `app.json` por app.

## 9. Testing

Automático (requieren API en `:8000` con BD migrada 02-07): `api_f2_auth` (10),
`api_f3_dominio` (20), `api_f7_integracion` (expirado→401 + loop), `api_f8_gestion`
(sugerencia/SLA/claim/derivar/seguir/historial), `api_f9_fases` (idempotencia/réplica/
internas/transiciones/bulk/merge/métricas/openapi), `api_f10_fase4` (IA/copiloto/resumen/
notifs/chatbot/OCR/adjuntos), `api_f11_contrato` (formas + OpenAPI 1.4.0),
`api_f12_sesiones_gdpr` (refresh/logout/GDPR/email), `api_f13_equipo_reset` (reset/equipo),
con `tests/mint_expired.php`. CI (`.github/workflows/api.yml`): lint PHP + migraciones + health.
E2E móvil: `tests/e2e/*.yaml` (Maestro). Manual: checklist Expo Go en `README.md`.

## 10. Git

Repo con remoto `origin` (`github.com/ynnxx23/Despegar`, rama `main`), Conventional Commits
en español, `.gitignore` (`.env`, `node_modules/`, `.expo/`, `.vscode/`, `backend/uploads/`).
`backend/.env` jamás trackeado. Snapshot web de referencia (`Despegar_*.html`) sin trackear.

## 11. Entorno y despliegue

Servicios: PostgreSQL `:5432` (rol `despegar`/`despegar_dev`, BD `despegar`), API
`php -S 0.0.0.0:8000 -t backend/public backend/public/index.php` (`0.0.0.0` para LAN; XAMPP PHP 8.2 con `pdo_pgsql`),
migraciones con `php backend/db_migrate.php`, apps con IP LAN (`10.0.2.2` en emulador).
Variables `.env`: ver `backend/.env.example` (DB, JWT, CORS, rate-limits, STT/OCR/push).
Comandos BD en `README.md`.

## 12. Decisiones técnicas

PHP puro sin framework (evalúa POO/PDO) · JWT manual sin dependencias · PostgreSQL por
rutinas · funciones + procedimientos con uso real · dos apps separadas (aíslan permisos) ·
`fetch` en vez de Axios · refresh con rotación (30d) + revoke · Docker solo opcional ·
texto plano en UI (sin emojis) · fuente del sistema · tokens EVA reales del sitio.

## 13. Limitaciones conocidas

Credenciales demo en repo (cambiar en prod). Push/FCM/WhatsApp/Whisper requieren claves
(ver `docs/api.md` §8; sin claves = no-op con traza). `password` superusuario PG local
documentada en el historial del proyecto.
