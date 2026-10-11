# Despegar — Grupo 8 (Gestión de Incidentes Críticos)
Ver `PLAN_DESARROLLO_DESPEGAR.md` (fuente de planificación, F0). BD **PostgreSQL 15** (schema v3 con trigger, funciones y procedimiento).
Documentación: `DOC_PROYECTO.md` (general) y `DOC_DESARROLLO.md` (especificaciones técnicas).

## Requisitos (qué necesita el proyecto para funcionar)
| Componente | Versión | Verificación |
|---|---|---|
| PostgreSQL | 15 x64 | servicio en `:5432`; BD `despegar`, rol `despegar` con password propia (solo en `backend/.env`) |
| PHP | 8.2 | `C:\xampp\php\php.exe` con `extension=pdo_pgsql` activa en `php.ini` |
| Node.js + npm | 20+ | `node --version` (Expo SDK 57) |
| Expo Go | en el celular | app oficial, misma versión SDK 57 del proyecto |
| Red | PC y celular en la **misma** Wi-Fi/LAN | el celular llega a `http://<IP-LAN-PC>:8000` (API) y `:8081`/`:8082` (Metro) |
| Firewall Windows | reglas entrantes TCP `8000` y `8081-8082` | red del PC perfilada como **Privada** (pestaña *Firewall & protection*) |

Sin PostgreSQL la API responde `/api/health` pero falla todo lo que toque la BD.
Sin `pdo_pgsql` igual: el health responde, el login no.

## Estructura
- `backend/` PHP 8.2 POO + PDO pgsql (sin framework). Entrada: `backend/public/index.php`. Modelos: `Usuario`, `Reserva`, `Incidente`, `GestionCaso` (asignado/seguidores/eventos), `Respuesta`, `RefreshToken`.
- `db/` schema + seeds PostgreSQL (`schema.sql` crea tablas, trigger `trg_incidentes_touch`, funciones `touch_actualizado_at()`, `crear_respuesta()`, `resumen_cola()` y procedimiento `sembrar_demo()`; `seeds.sql` = `CALL sembrar_demo()`) + `migrate_0*.sql` (solo para bases v2).
- `apps/viajero/` App 1 Portal Ayuda al Viajero (Expo RN).
- `apps/agente/` App 2 Centro Resolución (Expo RN) + `components/` (paneles y estilos de la gestión).
- `apps/shared/` theme + api client + auth + componentes.
- `deploy/` `api-url.txt` (URL pública de la API), `init-db.ps1` (schema+seeds+migraciones contra la BD de Railway) y `railway-pause.ps1` / `railway-resume.ps1` (pausar la API para dejar de facturar).
- `docs/` `api.md`, `app-viajero.md`, `app-agente.md`, `railway.md` (deploy en la nube).
- `Dockerfile` + `.dockerignore` imagen de producción para Railway; `.railwayignore` qué se sube.

## Dev rápido (PostgreSQL local)
Requisito PHP: extensión `pdo_pgsql` activa (`extension=pdo_pgsql` en `php.ini`).
1. Crear rol/BD una vez (tu password, no se versiona): `createuser -U postgres -d despegar -P` y `createdb -U postgres -O despegar despegar`.
2. Aplicar: `psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql` (base nueva: el schema ya trae los 7 tipos de incidente, la prioridad nullable y la tabla de refresh tokens).
   Base vieja (schema v2): usar `deploy\init-db.ps1`, que corre solo seeds + migraciones.
3. Copiar `backend/.env.example` a `backend/.env` y ajustar `DB_PASS` + `JWT_SECRET` (generar uno random de 32+ bytes: `openssl rand -hex 32`).
4. `php -S localhost:8000 -t backend/public` → `GET http://localhost:8000/api/health`.

Opción B con Docker (opcional): `docker compose up --build` → API `:8000`, PostgreSQL `:5432` (init automático con `db/`).

Opción C (nube, la que usan las apps ahora): API en Railway → `https://api-production-88975.up.railway.app/api`.
PostgreSQL vive en Railway (plugin), la BD se inicializa por túnel SSH con `deploy/init-db.ps1`.
Ver `docs/railway.md`.

## API (base `/api`, JSON, `Authorization: Bearer <jwt>`)
| Método | Ruta | Rol | Uso |
|---|---|---|---|
| POST | `/register` | público | Alta viajero (password 8-72, bcrypt) → 201 |
| POST | `/login` | público | JWT HS256 8h + refresh token (30 días) |
| POST | `/refresh` | público | Canjea el refresh token por un access token nuevo (rota el refresh) |
| POST | `/logout` | público | Revoca el refresh token |
| GET | `/me` | auth | Sesión actual |
| GET | `/itinerario` | viajero | Sus reservas |
| GET/POST | `/incidentes/mios`, `/incidentes` | viajero | Listar propios / crear (7 tipos, sugerencia auto, sin prioridad real) |
| GET | `/incidentes/:id`(+`/respuestas`) | dueño o agente | Detalle (+`atendido_por`, historial público) e hilo |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc\|urgencia&page=&limit=` | agente | Cola urgencia (vencidos SLA, sin triar, Critica/Alta/Baja) + filtros. Cada caso trae `asignado_a`, `asignado_nombre`, `siguiendo` y `seguidores_count` |
| GET | `/admin/incidentes/resumen` | agente | Conteos `resumen_cola()` + `sin_triar,vencidos,mios` |
| GET/PUT | `/admin/incidentes/:id` | agente | Ver (`asignado`, `seguidores`, `siguiendo`, `mi_asignado`) / triaje prioridad+SLA+estado (Resuelto exige prioridad) |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | Hilo / responder (atómico vía `crear_respuesta()`) |
| POST | `/admin/incidentes/:id/claim`, `/release`, `/derivar`, `/seguir` | agente | Tomar / liberar / derivar `{agente_id,motivo?}` / seguir (cualquier agente puede seguir un caso, tenga o no) |
| DELETE | `/admin/incidentes/:id/seguir` | agente | Dejar de seguir |
| GET | `/admin/incidentes/:id/historial`, `/admin/agentes`, `/admin/mi-cola?vista=mios\|siguiendo` | agente | Eventos con actor / agentes / mi cola: `mios` = lo que reclamé, `siguiendo` = lo que sigo y no es mío (sin `vista`: unión) |

Errores: 400 validación, 401 sin token/inválido/expirado, 403 rol insuficiente o recurso ajeno, 404 inexistente, 409 email duplicado.

## Tests (F9)
Requieren API en `:8000`:
`powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1` (auth/roles/SQLi/refresh) ·
`tests/api_f3_dominio.ps1` (itinerario/incidentes/cola/403) ·
`tests/api_f7_integracion.ps1` (JWT expirado→401 + loop viajero→agente→viajero) ·
`tests/api_f8_gestion.ps1` (sugerencia/SLA/claim/derivar/seguir/historial).

58 checks en verde (F2 15 · F3 20 · F7 3 · F8 20).

Cliente móvil (sin API): `node --test tests/api_client_refresh.test.mjs` (renovación de sesión, header Bearer, aviso de URL) — 4 checks.

## Apps (manual, F5/F6)
`cd apps/viajero && npm install && npx expo start` (idem `apps/agente`). La URL de la API sale de `EXPO_PUBLIC_API_URL`, que Expo incrusta al compilar: los `.cmd` la escriben en `apps/<app>/.env` desde `deploy/api-url.txt` (nube) o desde la IP LAN detectada (`.cmd local`); `localhost` no sirve desde el celular.
Credenciales demo (la app **no** las muestra): viajero `ana@test.com` / `Viaje1234` (otra: `bruno@test.com` / `Viaje5678`), agente `agente@despegar.com` / `Agente123` (otra: `maria@despegar.com` / `Agente456`).
Checklist: login/logout, itinerario con pull-refresh, crear incidente con confirmación, filtros, cola agente con resumen, **reclamar** un caso (aparece en "Míos"), **seguir** un caso (aparece en "Siguiendo"), PUT prioridad/estado (Resuelto confirma), responder y leer hilo cruzado.

### App móvil: "Conectando…" infinito en el login
La URL de la API se **incrusta en el bundle** al compilar (`EXPO_PUBLIC_API_URL` en `apps/*/.env`).
Si esa IP quedó vieja (IP dinámica por DHCP) el celular no recibe respuesta y el `fetch` de RN
—sin timeout— queda colgado para siempre.

| Chequeo | Cómo |
|---|---|
| ¿El `.env` tiene la URL correcta? | `type apps\viajero\.env` → debe coincidir con `deploy\api-url.txt` (o con la IP LAN si usás `local`) |
| ¿La URL quedó vieja? | `start-viajero.cmd` / `start-agente.cmd` reescriben el `.env` en cada arranque; después hay que **reiniciar Expo** (la URL va incrustada en el bundle) |
| ¿Llega la petición al servidor? | el log de `php -S` muestra `192.168.x.x [200]: GET /api/health`; si no aparece, es red/firewall |
| ¿Prueba desde el navegador del celular? | `http://<IP-LAN-PC>:8000/api/health` (local) o `https://api-production-88975.up.railway.app/api/health` (nube) debe devolver `{"ok":true,...}` |
| ¿Cuelgue por red? | VPN activa o datos móviles priorizados: el tráfico a `192.168.x.x` se va por internet y no vuelve |

El cliente HTTP corta a los 8 s (`apps/shared/api.js`) y muestra el error real, así que la UI
ya no puede quedar en "Conectando…" para siempre.

### API en la nube (Railway) vs API local
`start-viajero.cmd` / `start-agente.cmd` eligen la URL de la API:
- con `deploy/api-url.txt` (versionado) → **API pública en Railway** (HTTPS; el celular no
  necesita la misma Wi-Fi ni la PC encendida);
- con argumento `local` → `http://<IP-LAN>:8000/api` (backend local).

La URL se incrusta en el bundle al compilar: hay que **reiniciar Expo** para que cambie.
Deploy completo en `docs/railway.md` (Dockerfile, variables, túnel SSH para el schema, costos).

## Seguridad (F10, verificado)
bcrypt cost 10-12 + salt auto · JWT HS256 `sub/rol/iat/exp` sin secretos · refresh token opaco (la BD guarda solo su SHA-256) con rotación de un solo uso · el rol se revalida contra la BD en cada request (degradar una cuenta corta el acceso al instante) · SecureStore (no plano) · PDO prepared everywhere · 401 genérico en login · errores sin traces/SQL (handler global) · secretos solo en `.env` (`.gitignore` cubre `.env` y `.env.*` salvo `.env.example`) · los valores que estuvieron publicados se rotaron · CORS configurable (`CORS_ORIGIN`): sin valor no se manda ninguna cabecera CORS, `*` solo en dev.

## Documentación
| Doc | Qué cubre |
|---|---|
| [`DOC_PROYECTO.md`](DOC_PROYECTO.md) | qué es el proyecto, roles, flujos, alcance |
| [`DOC_DESARROLLO.md`](DOC_DESARROLLO.md) | stack, estructura, backend, API, apps, testing, despliegue |
| [`PLAN_DESARROLLO_DESPEGAR.md`](PLAN_DESARROLLO_DESPEGAR.md) | plan original por fases (F0-F10) |
| [`docs/api.md`](docs/api.md) | referencia de endpoints y BD |
| [`docs/app-viajero.md`](docs/app-viajero.md) | app del viajero: pantallas, flujos, checklist |
| [`docs/app-agente.md`](docs/app-agente.md) | app del agente: pestañas, reclamar/seguir, checklist |
| [`docs/railway.md`](docs/railway.md) | deploy en la nube y cómo apuntar las apps |
