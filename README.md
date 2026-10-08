# Despegar — Grupo 8 (Gestión de Incidentes Críticos)
Ver `PLAN_DESARROLLO_DESPEGAR.md` (fuente de planificación, F0). BD **PostgreSQL 15** (schema v2 con trigger, funciones y procedimiento).
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
- `backend/` PHP 8.2 POO + PDO pgsql (sin framework). Entrada: `backend/public/index.php`.
- `db/` schema + seeds PostgreSQL (`schema.sql` crea tablas, trigger `trg_incidentes_touch`, funciones `touch_actualizado_at()`, `crear_respuesta()`, `resumen_cola()` y procedimiento `sembrar_demo()`; `seeds.sql` = `CALL sembrar_demo()`).
- `apps/viajero/` App 1 Portal Ayuda al Viajero (Expo RN).
- `apps/agente/` App 2 Centro Resolución (Expo RN).
- `apps/shared/` theme + api client + auth + componentes.

## Dev rápido (PostgreSQL local)
Requisito PHP: extensión `pdo_pgsql` activa (`extension=pdo_pgsql` en `php.ini`).
1. Crear rol/BD una vez (tu password, no se versiona): `createuser -U postgres -d despegar -P` y `createdb -U postgres -O despegar despegar`.
2. Aplicar: `psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql -f db/migrate_02_prioridad_nullable.sql -f db/migrate_03_gestion_casos.sql`.
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
| POST | `/login` | público | JWT HS256 8h |
| GET | `/me` | auth | Sesión actual |
| GET | `/itinerario` | viajero | Sus reservas |
| GET/POST | `/incidentes/mios`, `/incidentes` | viajero | Listar propios / crear (7 tipos, sugerencia auto, sin prioridad real) |
| GET | `/incidentes/:id`(+`/respuestas`) | dueño o agente | Detalle (+`atendido_por`, historial público) e hilo |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc\|urgencia&page=&limit=` | agente | Cola urgencia (vencidos SLA, sin triar, Critica/Alta/Baja) + filtros |
| GET | `/admin/incidentes/resumen` | agente | Conteos `resumen_cola()` + `sin_triar,vencidos,mios` |
| GET/PUT | `/admin/incidentes/:id` | agente | Ver / triaje prioridad+SLA+estado (Resuelto exige prioridad) |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | Hilo / responder (atómico vía `crear_respuesta()`) |
| POST | `/admin/incidentes/:id/claim`, `/release`, `/derivar`, `/seguir` | agente | Tomar / liberar / derivar `{agente_id,motivo?}` / seguir |
| DELETE | `/admin/incidentes/:id/seguir` | agente | Dejar de seguir |
| GET | `/admin/incidentes/:id/historial`, `/admin/agentes`, `/admin/mi-cola` | agente | Eventos con actor / agentes / mi cola (asignados+seguidos) |

Errores: 400 validación, 401 sin token/inválido/expirado, 403 rol insuficiente o recurso ajeno, 404 inexistente, 409 email duplicado.

## Tests (F9)
Requieren API en `:8000`:
`powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1` (auth/roles/SQLi) ·
`tests/api_f3_dominio.ps1` (itinerario/incidentes/cola/403) ·
`tests/api_f7_integracion.ps1` (JWT expirado→401 + loop viajero→agente→viajero) ·
`tests/api_f8_gestion.ps1` (sugerencia/SLA/claim/derivar/seguir/historial).

## Apps (manual, F5/F6)
`cd apps/viajero && npm install && npx expo start` (idem `apps/agente`), apuntando a `http://<tu-IP>:8000/api` (editar `BASE_URL` en `apps/shared/api.js`; localhost no sirve desde el celular).
Checklist: login/logout, itinerario con pull-refresh, crear incidente con confirmación, filtros, cola agente con resumen, PUT prioridad/estado (Resuelto confirma), responder y leer hilo cruzado.

### App móvil: "Conectando…" infinito en el login
La URL de la API se **incrusta en el bundle** al compilar (`EXPO_PUBLIC_API_URL` en `apps/*/.env`).
Si esa IP quedó vieja (IP dinámica por DHCP) el celular no recibe respuesta y el `fetch` de RN
—sin timeout— queda colgado para siempre.

| Chequeo | Cómo |
|---|---|
| ¿Qué URL está usando el celular? | el login muestra `API: <host>`; si dice `localhost` es que el `.env` no se aplicó |
| ¿La IP del `.env` es la actual? | `start-viajero.cmd` / `start-agente.cmd` reescriben el `.env` con la IP LAN vigente en cada arranque |
| ¿Llega la petición al servidor? | el log de `php -S` muestra `192.168.x.x [200]: GET /api/health`; si no aparece, es red/firewall |
| ¿Prueba desde el navegador del celular? | `http://<IP-LAN-PC>:8000/api/health` debe devolver `{"ok":true,...}` |
| ¿Cuelgue por red? | VPN activa o datos móviles priorizados: el tráfico a `192.168.x.x` se va por internet y no vuelve |

El cliente HTTP corta a los 8 s (`apps/shared/api.js`) y muestra el error real, así que la UI
ya no puede quedar en "Conectando…" para siempre.

### API en la nube (Railway) vs API local
`start-viajero.cmd` / `start-agente.cmd` eligen la URL de la API:
- con `apps/<app>/.env.railway` (versionado) → **API pública en Railway** (HTTPS; el celular no
  necesita la misma Wi-Fi ni la PC encendida);
- con argumento `local` → `http://<IP-LAN>:8000/api` (backend local).

La URL se incrusta en el bundle al compilar: hay que **reiniciar Expo** para que cambie.
Deploy completo en `docs/railway.md` (Dockerfile, variables, túnel SSH para el schema, costos).

## Seguridad (F10, verificado)
bcrypt cost 10-12 + salt auto · JWT HS256 `sub/rol/iat/exp` sin secretos · SecureStore (no plano) · PDO prepared everywhere · 401 genérico en login · errores sin traces/SQL · secretos solo en `.env` (gitignored) · CORS abierto solo en dev.
