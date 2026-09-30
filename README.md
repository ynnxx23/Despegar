# Despegar — Grupo 8 (Gestión de Incidentes Críticos)
Ver `PLAN_DESARROLLO_DESPEGAR.md` (fuente de planificación, F0). Enmienda: BD migrada de MySQL a **PostgreSQL 15** (schema v2 con trigger, funciones y procedimiento).

## Estructura
- `backend/` PHP 8.2 POO + PDO pgsql (sin framework). Entrada: `backend/public/index.php`.
- `db/` schema + seeds PostgreSQL (`schema.sql` crea tablas, trigger `trg_incidentes_touch`, funciones `touch_actualizado_at()`, `crear_respuesta()`, `resumen_cola()` y procedimiento `sembrar_demo()`; `seeds.sql` = `CALL sembrar_demo()`).
- `apps/viajero/` App 1 Portal Ayuda al Viajero (Expo RN).
- `apps/agente/` App 2 Centro Resolución (Expo RN).
- `apps/shared/` theme + api client + auth + componentes.

## Dev rápido (PostgreSQL local)
Requisito PHP: extensión `pdo_pgsql` activa (`extension=pdo_pgsql` en `php.ini`).
1. Crear rol/BD una vez: `createdb -U postgres -O despegar despegar` (pass rol: `despegar_dev`).
2. Aplicar: `psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql`.
3. Copiar `backend/.env.example` a `backend/.env` y ajustar.
4. `php -S localhost:8000 -t backend/public` → `GET http://localhost:8000/api/health`.

Opción B con Docker (opcional): `docker compose up --build` → API `:8000`, PostgreSQL `:5432` (init automático con `db/`).

## API (base `/api`, JSON, `Authorization: Bearer <jwt>`)
| Método | Ruta | Rol | Uso |
|---|---|---|---|
| POST | `/register` | público | Alta viajero (password 8-72, bcrypt) → 201 |
| POST | `/login` | público | JWT HS256 8h |
| GET | `/me` | auth | Sesión actual |
| GET | `/itinerario` | viajero | Sus reservas |
| GET/POST | `/incidentes/mios`, `/incidentes` | viajero | Listar propios / crear (tipo, título 5-120, desc 10-2000) |
| GET | `/incidentes/:id`(+`/respuestas`) | dueño o agente | Detalle e hilo |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc&page=&limit=` | agente | Cola FIFO + filtros |
| GET | `/admin/incidentes/resumen` | agente | Conteos `resumen_cola()` |
| GET/PUT | `/admin/incidentes/:id` | agente | Ver / prioridad+estado |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | Hilo / responder (atómico vía `crear_respuesta()`) |

Errores: 400 validación, 401 sin token/inválido/expirado, 403 rol insuficiente o recurso ajeno, 404 inexistente, 409 email duplicado.

## Tests (F9)
Requieren API en `:8000`:
`powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1` (auth/roles/SQLi) ·
`tests/api_f3_dominio.ps1` (itinerario/incidentes/cola/403) ·
`tests/api_f7_integracion.ps1` (JWT expirado→401 + loop viajero→agente→viajero).

## Apps (manual, F5/F6)
`cd apps/viajero && npm install && npx expo start` (idem `apps/agente`), apuntando a `http://<tu-IP>:8000/api` (editar `BASE_URL` en `apps/shared/api.js`; localhost no sirve desde el celular).
Checklist: login/logout, itinerario con pull-refresh, crear incidente con confirmación, filtros, cola agente con resumen, PUT prioridad/estado (Resuelto confirma), responder y leer hilo cruzado.

## Seguridad (F10, verificado)
bcrypt cost 10-12 + salt auto · JWT HS256 `sub/rol/iat/exp` sin secretos · SecureStore (no plano) · PDO prepared everywhere · 401 genérico en login · errores sin traces/SQL · secretos solo en `.env` (gitignored) · CORS abierto solo en dev.
