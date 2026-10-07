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
  public/index.php          # router + CORS + init (única entrada)
  .env / .env.example       # secretos (.env gitignored, jamás commitear)
  src/Config.php            # lee .env sin librerías
  src/Database.php          # singleton PDO (ERRMODE_EXCEPTION, EMULATE_PREPARES=false)
  src/Utils/JwtHS256.php    # JWT HS256 manual (hash_hmac + hash_equals)
  src/Utils/Response.php    # JSON uniforme {data} / {error:{code,message}}
  src/Middleware/Auth.php   # Bearer + requireRole (401/403)
  src/Models/               # Usuario, Reserva, Incidente, Respuesta (solo SQL preparado)
  src/Controllers/          # Auth, Itinerario, Incidentes (viajero), Admin (agente)
db/
  schema.sql                # tablas + trigger trg_incidentes_touch + funciones
                            # touch_actualizado_at(), crear_respuesta(), resumen_cola()
                            # + procedimiento sembrar_demo()
  seeds.sql                 # CALL sembrar_demo() (idempotente)
```

## 2. Levantar en local

```powershell
# 1. Rol/BD (una vez)
createdb -U postgres -O despegar despegar   # pass rol: despegar_dev
# 2. Schema + seeds + migraciones
psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql -f db/migrate_02_prioridad_nullable.sql -f db/migrate_03_gestion_casos.sql
# 3. Env
copy backend\.env.example backend\.env   # ajustar JWT_SECRET (>=32 bytes)
# 4. Servir (0.0.0.0 para alcance LAN desde el celular)
php -S 0.0.0.0:8000 -t backend/public
# 5. Verificar
# GET http://localhost:8000/api/health -> {ok,service,fase}
```

Opción Docker (opcional): `docker compose up --build` → API `:8000`, PostgreSQL `:5432`.

Variables `.env` (`backend/.env.example`): `DB_HOST/PORT/NAME/USER/PASS`,
`JWT_SECRET`, `BCRYPT_COST` (10-12), `JWT_TTL_HOURS` (1-24, defecto 8).

## 3. Auth

- Registro público solo rol `viajero`. Cuentas `agente` las crea el equipo.
- Login responde 401 genérico (no revela si el email existe).
- JWT HS256 claims `{sub,rol,iat,exp}`, expira 8h. Header: `Authorization: Bearer <jwt>`.
- `Auth::requireRole([...])`: 401 sin/inválido/expirado, 403 rol insuficiente o recurso ajeno.
- Contraseñas: `password_hash(BCRYPT)` + `password_verify`, nunca se devuelven (`toSafe`).

## 4. Endpoints (base `/api`, JSON)

| Método | Ruta | Rol | Body / params | Éxito | Errores |
|---|---|---|---|---|---|
| GET | `/health` | — | — | 200 `{ok,service,fase}` | — |
| POST | `/register` | público | `{nombre 2-100, email, password 8-72}` | 201 `{user,token}` (rol `viajero`) | 400, 409 |
| POST | `/login` | público | `{email,password}` | 200 `{user,token}` | 400, 401 |
| GET | `/me` | auth | — | 200 `{user}` | 401 |
| GET | `/itinerario` | viajero | — | 200 `{data:[reservas]}` | 401, 403 |
| GET | `/incidentes/mios?estado=` | viajero | filtro opcional | 200 `{data}` | 400, 401, 403 |
| POST | `/incidentes` | viajero | `{reserva_id?, tipo, titulo 5-120, descripcion 10-2000}` (`reserva_id` debe ser propia). Tipos: `Vuelo_cancelado, Vuelo_retrasado, Hotel_sin_reserva, Equipaje, Cobro_indebido, Fraude, Otro`. Al crear se calcula `prioridad_sugerida` (base: Fraude=Critica; Vuelo_cancelado/Hotel_sin_reserva/Equipaje/Cobro_indebido=Alta; Vuelo_retrasado/Otro=Baja; +1 nivel máx Critica si hay `urgente,varad,hoy,ahora,estafa,menor,salud,hospital,embarazada,discapacidad`) + `prioridad_motivo`; el viajero nunca ve `prioridad` real | 201 (Abierto, evento `creado`) | 400, 401, 403, 404 |
| GET | `/incidentes/:id` | dueño o agente | dueño ve `{atendido_por, historial:[{texto,creado_at}]}` público (solo claim/responder/estado/resuelto/reabierto, sin motivos internos); agente ve incidente+usuario+reserva | 200 | 401, 403, 404 |
| GET | `/incidentes/:id/respuestas` | dueño o agente | — | 200 `{data:[hilo]}` | 401, 403, 404 |
| GET | `/admin/incidentes?estado=&prioridad=&orden=asc\|desc\|urgencia&page=&limit=` | agente | `orden=urgencia` (defecto): vencidos SLA primero, luego sin triar (`prioridad` NULL), luego Critica/Alta/Baja, luego creado ASC (`sla` NULLS LAST) | 200 `{data,total,page,limit}` | 400, 401, 403 |
| GET | `/admin/incidentes/resumen` | agente | — | 200 `{data:[{estado,prioridad,total}], sin_triar, vencidos, mios}` vía `resumen_cola()` + conteos | 401, 403 |
| GET/PUT | `/admin/incidentes/:id` | agente | PUT parcial `{prioridad?,estado?}` = triaje: fija `triado_por/at`, `sla_vence_at = now + SLA` (Critica 4h, Alta 24h, Baja 72h); Resuelto exige prioridad (400 si no) | 200 | 400, 401, 403, 404 |
| GET/POST | `/admin/incidentes/:id/respuestas` | agente | POST `{mensaje 2-2000}` (pasa a EnGestion, atómico vía `crear_respuesta()`; evento `responder`) | GET 200 / POST 201 | 400, 401, 403, 404 |
| POST | `/admin/incidentes/:id/claim` | agente | Toma el caso (`asignado_a=yo`, Abierto→EnGestion, evento `claim`); 409 si asignado a otro; idempotente si ya es mío | 200 | 401, 403, 404, 409 |
| POST | `/admin/incidentes/:id/release` | agente | Libera (`asignado_a=NULL`, evento `release`) | 200 | 401, 403, 404 |
| POST | `/admin/incidentes/:id/derivar` | agente | `{agente_id, motivo?}` (destino rol agente, 404 si no; 400 si es el actual; evento `derivar`) | 200 | 400, 401, 403, 404 |
| POST/DELETE | `/admin/incidentes/:id/seguir` | agente | Seguir / dejar de seguir (idempotentes; eventos `seguir`/`dejar_seguir`) | 200 | 401, 403, 404 |
| GET | `/admin/incidentes/:id/historial` | agente | Eventos con `actor_nombre` (`creado,claim,release,derivar,seguir,dejar_seguir,responder,estado,prioridad,triaje,resuelto,reabierto`) | 200 | 401, 403, 404 |
| GET | `/admin/agentes` | agente | — | 200 `{data:[{id,nombre,email}]}` | 401, 403 |
| GET | `/admin/mi-cola?estado=&prioridad=&orden=urgencia&page=&limit=` | agente | Asignados a mí o seguidos por mí; excluye Resueltos salvo `?estado=Resuelto`; misma paginación | 200 | 400, 401, 403 |

Códigos: 400 validación, 401 sin token/inválido/expirado, 403 rol o recurso ajeno,
404 inexistente, 409 email duplicado o caso asignado a otro (claim), 500 genérico (detalle solo en `error_log`).

## 4b. Flujo triage/SLA/claim

1. Viajero crea → `prioridad` NULL (sin triar) + `prioridad_sugerida`/`prioridad_motivo` + evento `creado`.
2. Agente filtra cola con `orden=urgencia` o abre `mi-cola`; `resumen` muestra `sin_triar/vencidos/mios`.
3. Agente `claim` (o `derivar`/`seguir`) → `atendido_por` visible al viajero + evento.
4. Agente tria con `PUT prioridad` → `triado_por/at` + `sla_vence_at = now + SLA` (4/24/72h) + eventos `prioridad`/`triaje`.
5. Agente responde / cambia estado → eventos `responder`/`estado`/`resuelto`/`reabierto`; el viajero solo ve historial público.
6. Cierre exige prioridad: `PUT estado=Resuelto` sin prioridad (real o en body) → 400.

## 5. Base de datos (resumen operativo)

Tablas: `usuarios`, `reservas` (FK `user_id` CASCADE), `incidentes`
(FK `user_id` CASCADE, `reserva_id` SET NULL, `asignado_a` SET NULL, `triado_por` sin FK dura),
`respuestas` (FK `incidente_id`/`autor_id` CASCADE), `incidente_eventos`
(FK `incidente_id` CASCADE, `actor_id` SET NULL; índice `(incidente_id,creado_at)`),
`incidente_seguidores` (PK compuesta + índice `(agente_id)`). Valores cerrados con `CHECK`:
rol, tipo (7: `Vuelo_cancelado,Vuelo_retrasado,Hotel_sin_reserva,Equipaje,Cobro_indebido,Fraude,Otro`), prioridad (Baja/Alta/Critica — sin tilde en BD), estado
(Abierto/EnGestion/Resuelto — `crear_respuesta()` escribe `EnGestion`).

Rutinas con uso real: trigger `trg_incidentes_touch` (`actualizado_at` automático),
`crear_respuesta()` (respuesta + cambio de estado en una transacción),
`resumen_cola()` (conteos del panel), `sembrar_demo()` (seed idempotente).

Credenciales demo (solo desarrollo): `agente@despegar.com` / `Agente123`,
`maria@despegar.com` / `Agente456`, `ana@test.com` / `Viaje1234`, `bruno@test.com` / `Viaje5678`.

## 6. Tests

Requieren API en `:8000`, BD prístina (reaplicar schema+seeds antes):

```powershell
powershell -ExecutionPolicy Bypass -File tests/api_f2_auth.ps1        # auth/roles/SQLi (10 checks)
powershell -ExecutionPolicy Bypass -File tests/api_f3_dominio.ps1     # dominio/cola/403 (20 checks)
powershell -ExecutionPolicy Bypass -File tests/api_f7_integracion.ps1 # expirado->401 + loop viajero->agente->viajero
powershell -ExecutionPolicy Bypass -File tests/api_f8_gestion.ps1     # gestion: sugerencia/SLA/claim/derivar/seguir/historial
```

Referencia: 33/33 en verde. `tests/mint_expired.php` genera JWT expirado para F7.

## 7. Seguridad y límites

- `PDO::prepare` en todo, `CHECK`s como defensa en profundidad, errores sin traces/SQL.
- CORS `*` solo-dev. Secretos solo en `.env` (verificado fuera de git).
- Sin refresh-token v1 (re-login cada 8h). Sin framework a propósito (evalúa POO/PDO).
