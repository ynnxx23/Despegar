# Despegar â€” Grupo 8 (GestiÃ³n de Incidentes CrÃ­ticos)
Ver `PLAN_DESARROLLO_DESPEGAR.md` (fuente de planificaciÃ³n, F0). BD **PostgreSQL 16** (schema v4 con triggers, funciones y procedimiento).
DocumentaciÃ³n: `DOC_PROYECTO.md` (general) y `DOC_DESARROLLO.md` (especificaciones tÃ©cnicas).
Cuentas de prueba (admins, agentes y viajeros): **`datos.md`**.

## Requisitos (quÃ© necesita el proyecto para funcionar)
| Componente | VersiÃ³n | VerificaciÃ³n |
|---|---|---|
| PostgreSQL | 15 x64 | servicio en `:5432`; BD `despegar`, rol `despegar` con password propia (solo en `backend/.env`) |
| PHP | 8.5.12 | `C:\xampp\php\php.exe` con `extension=pdo_pgsql` activa en `php.ini` |
| Node.js + npm | 20+ | `node --version` (Expo SDK 57) |
| Expo Go | en el celular | app oficial, misma versiÃ³n SDK 57 del proyecto |
| Red | PC y celular en la **misma** Wi-Fi/LAN | el celular llega a `http://<IP-LAN-PC>:8000` (API) y `:8081`/`:8082` (Metro) |
| Firewall Windows | reglas entrantes TCP `8000` y `8081-8082` | red del PC perfilada como **Privada** (pestaÃ±a *Firewall & protection*) |

Sin PostgreSQL la API responde `/api/health` pero falla todo lo que toque la BD.
Sin `pdo_pgsql` igual: el health responde, el login no.

## Estructura
- `backend/` PHP 8.5.12 POO + PDO pgsql (sin framework). Entrada: `backend/public/index.php` (tabla de rutas con roles, 405 real y versionado `/api` + `/api/v1`). Modelos: `Usuario`, `Reserva`, `Incidente`, `GestionCaso` (asignado/seguidores/eventos), `Respuesta`, `RefreshToken`, `Auditoria` (historial de cambios de usuarios).
- `db/` schema + seeds PostgreSQL (`schema.sql` crea tablas, triggers `trg_incidentes_touch`/`trg_incidentes_agente`, funciones `touch_actualizado_at()`, `chequear_agente_asignado()`, `crear_respuesta()`, `resumen_cola()`, helpers `upsert_*` y el procedimiento `sembrar_demo()` en `seed_demo.sql`; `seeds.sql` = `CALL sembrar_demo()`) + `migrate_0*.sql` (para bases con un schema anterior).
- `apps/viajero/` App 1 Portal Ayuda al Viajero (Expo RN).
- `apps/agente/` App 2 Centro ResoluciÃ³n (Expo RN) + `components/` (paneles y estilos de la gestiÃ³n) + `screens/AdminUsuariosScreen.js` (panel de administraciÃ³n de usuarios, solo rol `admin`).
- `apps/shared/` theme + api client + auth + sesiÃ³n (`session.js`) + hooks (`hooks.js`) + login compartido + componentes.
- `deploy/` `api-url.txt` (URL pÃºblica de la API), `init-db.ps1` (schema+seeds+migraciones contra la BD de Railway) y `railway-pause.ps1` / `railway-resume.ps1` (pausar la API para dejar de facturar).
- `docs/` `api.md`, `openapi.yaml` (contrato OpenAPI 3.0 de la API), `app-viajero.md`, `app-agente.md`, `railway.md` (deploy en la nube), `instalacion.md` (puesta en marcha: otra PC, Railway paso a paso, rutina de cada demo).
- `tests/` suites en PowerShell (F2/F3/F7/F8) + `api.test.mjs` (suite portable en Node, 16 checks) y `api_client_refresh.test.mjs` (cliente mÃ³vil).
- `.github/workflows/ci.yml` CI: PostgreSQL 16 + API + suites de Node en cada push.
- `Dockerfile` + `.dockerignore` imagen de producciÃ³n para Railway; `.railwayignore` quÃ© se sube. `docker-compose.yml` levanta la API + PostgreSQL en local.

## Prender / apagar la API en Railway (sin comandos)

Doble clic (o desde la terminal):

| Script | QuÃ© hace |
|---|---|
| `start-railway.cmd` | Enciende PostgreSQL y la API en Railway (~1-2 min) y verifica el health. Imprime la URL pÃºblica. |
| `stop-railway.cmd` | Apaga ambos servicios: **0 CPU / 0 RAM facturados**. Los datos quedan en el volumen. |

Ambos necesitan la CLI de Railway (`npm i -g @railway/cli`) y el proyecto vinculado
(`railway link` â†’ `despegar-api`). Deben correrse **desde la raÃ­z del repo**.

Equivalentes en PowerShell: `deploy\railway-resume.ps1` y `deploy\railway-pause.ps1`.

## Dev rÃ¡pido (PostgreSQL local)
Requisito PHP: extensiÃ³n `pdo_pgsql` activa (`extension=pdo_pgsql` en `php.ini`).
1. Crear rol/BD una vez (tu password, no se versiona): `createuser -U postgres -d despegar -P` y `createdb -U postgres -O despegar despegar`.
2. Aplicar: `psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql` (base nueva: el schema ya trae los 7 tipos de incidente, la prioridad nullable, el rol `admin`, la tabla de refresh tokens y la de auditorÃ­a).
   Base vieja (schema anterior): usar `deploy\init-db.ps1`, que corre solo seeds + migraciones (`migrate_05_admin_auditoria.sql` y `migrate_06_seed_demo_grande.sql`, idempotentes).
3. Copiar `backend/.env.example` a `backend/.env` y ajustar `DB_PASS` + `JWT_SECRET` (generar uno random de 32+ bytes: `openssl rand -hex 32`).
4. `php -S localhost:8000 -t backend/public` â†’ `GET http://localhost:8000/api/health`.

OpciÃ³n B con Docker (opcional): `docker compose up --build` â†’ API `:8000`, PostgreSQL `:5432`.
El compose usa el `Dockerfile` de la raÃ­z (php:8.5.12-cli + `pdo_pgsql`, el mismo de Railway) y monta
`db/schema.sql` + `db/seeds.sql` (mÃ¡s `db/seed_demo.sql`, que el schema incluye con `\ir`) en
`/docker-entrypoint-initdb.d/`: la base se crea sola con el seed demo y la API espera a que PostgreSQL estÃ© sano.
Si el volumen `pgdata` ya existe, los scripts **no** se vuelven a correr: `docker compose down -v && docker compose up --build`.

OpciÃ³n C (nube, la que usan las apps ahora): API en Railway â†’ `https://api-production-88975.up.railway.app/api`.
PostgreSQL vive en Railway (plugin), la BD se inicializa por tÃºnel SSH con `deploy/init-db.ps1`.
Ver `docs/railway.md`.

## API (base `/api`, JSON, `Authorization: Bearer <jwt>`)
| MÃ©todo | Ruta | Rol | Uso |
|---|---|---|---|
| POST | `/register` | pÃºblico | Alta viajero (password 8-72, bcrypt) â†’ 201 |
| POST | `/login` | pÃºblico | JWT HS256 8h + refresh token (30 dÃ­as) |
| POST | `/refresh` | pÃºblico | Canjea el refresh token por un access token nuevo (rota el refresh) |
| POST | `/logout` | pÃºblico | Revoca el refresh token |
| GET | `/me` | auth | SesiÃ³n actual |
| GET | `/itinerario` | viajero | Sus reservas |
| GET/POST | `/incidentes/mios`, `/incidentes` | viajero | Listar propios / crear (7 tipos, sugerencia auto, sin prioridad real) |
| GET | `/incidentes/:id`(+`/respuestas`) | dueÃ±o o agente | Detalle (+`atendido_por`, historial pÃºblico) e hilo |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc\|urgencia&page=&limit=` | agente | Cola urgencia (vencidos SLA, sin triar, Critica/Alta/Baja) + filtros. Cada caso trae `asignado_a`, `asignado_nombre`, `siguiendo` y `seguidores_count` |
| GET | `/admin/incidentes/resumen` | agente | Conteos `resumen_cola()` + `sin_triar,vencidos,mios` |
| GET/PUT | `/admin/incidentes/:id` | agente | Ver (`asignado`, `seguidores`, `siguiendo`, `mi_asignado`) / triaje prioridad+SLA+estado (Resuelto exige prioridad) |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | Hilo / responder (atÃ³mico vÃ­a `crear_respuesta()`) |
| POST | `/admin/incidentes/:id/claim`, `/release`, `/derivar`, `/seguir` | agente | Tomar / liberar / derivar `{agente_id,motivo?}` / seguir (cualquier agente puede seguir un caso, tenga o no) |
| DELETE | `/admin/incidentes/:id/seguir` | agente | Dejar de seguir |
| GET | `/admin/incidentes/:id/historial`, `/admin/agentes`, `/admin/mi-cola?vista=mios\|siguiendo` | agente | Eventos con actor / agentes / mi cola: `mios` = lo que reclamÃ©, `siguiendo` = lo que sigo y no es mÃ­o (sin `vista`: uniÃ³n) |
| GET/POST | `/admin/usuarios?rol=&q=&page=&limit=` | admin | Panel de administraciÃ³n: listar usuarios (rol, email, cantidad de incidentes, activo) |
| PUT | `/admin/usuarios/:id` | admin | `{rol?, activo?, password?, motivo?}`: promover a agente, activar/desactivar, resetear contraseÃ±a. No deja cambiarte el propio rol ni quedarse sin admins |
| GET | `/admin/usuarios/:id/historial`, `/admin/historial` | admin | Historial de cambios (actor, campo, valor anterior â†’ nuevo, motivo) |

Errores: 400 validaciÃ³n, 401 sin token/invÃ¡lido/expirado, 403 rol insuficiente o recurso ajeno, 404 inexistente, 405 mÃ©todo no permitido (header `Allow`), 409 email duplicado / caso ya asignado / no queda ningÃºn admin, 429 cuota de peticiones excedida (`Retry-After`), 500 genÃ©rico.

## Tests (F9)
Requieren API en `:8000`:
`powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1` (auth/roles/SQLi/refresh) Â·
`tests/api_f3_dominio.ps1` (itinerario/incidentes/cola/403) Â·
`tests/api_f7_integracion.ps1` (JWT expiradoâ†’401 + loop viajeroâ†’agenteâ†’viajero) Â·
`tests/api_f8_gestion.ps1` (sugerencia/SLA/claim/derivar/seguir/historial).

58 checks en verde (F2 15 Â· F3 20 Â· F7 3 Â· F8 20).

Suite portable (Node, corre en cualquier sistema y es la que usa el CI):
`node --test tests/api.test.mjs` â€” 16 checks: health + alias `/api/v1`, register 201/409, login 200/401,
SQLi 401, `/me` 401/200, token manipulado 401, refresh de un solo uso, 404 de endpoint inexistente,
405 con header `Allow`, 403 del viajero y del agente en los paneles de admin, panel de usuarios del
admin (listar, crear 201, promover y el historial del cambio), auto-guard del admin (400) y
revalidaciÃ³n del rol contra la BD (el token de un agente deja de servir si lo degradan: 403).
Base configurable con `API_BASE` (por defecto `http://127.0.0.1:8000`); si la API no estÃ¡ levantada,
la suite falla con el comando exacto para levantarla. Corre en ~3 s.

Cliente mÃ³vil (sin API): `node --test tests/api_client_refresh.test.mjs` (renovaciÃ³n de sesiÃ³n, header Bearer, aviso de URL) â€” 4 checks.

CI: `.github/workflows/ci.yml` levanta PostgreSQL + la API y corre las suites de Node en cada push
(mÃ¡s `php -l` de todo `backend/`; sin secrets, con valores de prueba fijos).

## Apps (manual, F5/F6)
`cd apps/viajero && npm install && npx expo start` (idem `apps/agente`). La URL de la API sale de `EXPO_PUBLIC_API_URL`, que Expo incrusta al compilar: los `.cmd` la escriben en `apps/<app>/.env` desde `deploy/api-url.txt` (nube) o desde la IP LAN detectada (`.cmd local`); `localhost` no sirve desde el celular.
Credenciales demo: ver **`datos.md`** (la app **no** las muestra). Hay 2 administradores, 4 agentes y 6 viajeros.
Checklist: login/logout, itinerario con pull-refresh, crear incidente con confirmaciÃ³n, filtros, cola agente con resumen, **reclamar** un caso (aparece en "MÃ­os"), **seguir** un caso (aparece en "Siguiendo"), PUT prioridad/estado (Resuelto confirma), responder y leer hilo cruzado.
Con un admin: pestaÃ±a **Administrar** â†’ registrar un agente nuevo, promover a agente a un usuario existente, activar/desactivar, resetear contraseÃ±a y ver el historial de cambios.

### App mÃ³vil: "Conectandoâ€¦" infinito en el login
La URL de la API se **incrusta en el bundle** al compilar (`EXPO_PUBLIC_API_URL` en `apps/*/.env`).
Si esa IP quedÃ³ vieja (IP dinÃ¡mica por DHCP) el celular no recibe respuesta y el `fetch` de RN
â€”sin timeoutâ€” queda colgado para siempre.

| Chequeo | CÃ³mo |
|---|---|
| Â¿El `.env` tiene la URL correcta? | `type apps\viajero\.env` â†’ debe coincidir con `deploy\api-url.txt` (o con la IP LAN si usÃ¡s `local`) |
| Â¿La URL quedÃ³ vieja? | `start-viajero.cmd` / `start-agente.cmd` reescriben el `.env` en cada arranque; despuÃ©s hay que **reiniciar Expo** (la URL va incrustada en el bundle) |
| Â¿Llega la peticiÃ³n al servidor? | el log de `php -S` muestra `192.168.x.x [200]: GET /api/health`; si no aparece, es red/firewall |
| Â¿Prueba desde el navegador del celular? | `http://<IP-LAN-PC>:8000/api/health` (local) o `https://api-production-88975.up.railway.app/api/health` (nube) debe devolver `{"ok":true,...}` |
| Â¿Cuelgue por red? | VPN activa o datos mÃ³viles priorizados: el trÃ¡fico a `192.168.x.x` se va por internet y no vuelve |

El cliente HTTP corta a los 8 s (`apps/shared/api.js`) y muestra el error real, asÃ­ que la UI
ya no puede quedar en "Conectandoâ€¦" para siempre.

### API en la nube (Railway) vs API local
`start-viajero.cmd` / `start-agente.cmd` eligen la URL de la API:
- con `deploy/api-url.txt` (versionado) â†’ **API pÃºblica en Railway** (HTTPS; el celular no
  necesita la misma Wi-Fi ni la PC encendida);
- con argumento `local` â†’ `http://<IP-LAN>:8000/api` (backend local).

La URL se incrusta en el bundle al compilar: hay que **reiniciar Expo** para que cambie.
Deploy completo en `docs/railway.md` (Dockerfile, variables, tÃºnel SSH para el schema, costos).

## Seguridad (F10, verificado)
bcrypt cost 10-12 + salt auto Â· JWT HS256 `sub/rol/iat/exp` sin secretos Â· refresh token opaco (la BD guarda solo su SHA-256) con rotaciÃ³n de un solo uso Â· el rol se revalida contra la BD en cada request (degradar una cuenta corta el acceso al instante) y las cuentas desactivadas no pueden iniciar sesiÃ³n Â· SecureStore (no plano) Â· PDO prepared everywhere Â· 401 genÃ©rico en login Â· errores sin traces/SQL (handler global) Â· secretos solo en `.env` (`.gitignore` cubre `.env` y `.env.*` salvo `.env.example`) Â· los valores que estuvieron publicados se rotaron Â· CORS configurable (`CORS_ORIGIN`): sin valor no se manda ninguna cabecera CORS, `*` solo en dev Â· headers de seguridad (`nosniff`, `DENY`, CSP, HSTS) Â· cuotas de peticiÃ³nes (login por IP y por cuenta, registro y refresh) que responden 429 con `Retry-After` Â· el panel de administraciÃ³n exige rol `admin`, no deja cambiar el propio rol ni quedarse sin admins, y **todo cambio queda en el historial** (`usuarios_auditoria`).

## DocumentaciÃ³n
| Doc | QuÃ© cubre |
|---|---|
| [`DOC_PROYECTO.md`](DOC_PROYECTO.md) | quÃ© es el proyecto, roles, flujos, alcance |
| [`DOC_DESARROLLO.md`](DOC_DESARROLLO.md) | stack, estructura, backend, API, apps, testing, despliegue |
| [`PLAN_DESARROLLO_DESPEGAR.md`](PLAN_DESARROLLO_DESPEGAR.md) | plan original por fases (F0-F10) |
| [`docs/api.md`](docs/api.md) | referencia de endpoints y BD |
| [`docs/openapi.yaml`](docs/openapi.yaml) | contrato de la API en OpenAPI 3.0 (esquemas, errores, `Authorization: Bearer`) |
| [`docs/app-viajero.md`](docs/app-viajero.md) | app del viajero: pantallas, flujos, checklist |
| [`docs/app-agente.md`](docs/app-agente.md) | app del agente: pestaÃ±as, reclamar/seguir, checklist |
| [`docs/railway.md`](docs/railway.md) | deploy en la nube y cÃ³mo apuntar las apps |

