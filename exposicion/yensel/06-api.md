# 06 — Referencia de la API

Base: `/api` (alias `/api/v1` idéntico) · JSON · `Authorization: Bearer <jwt>`.
Producción: `https://api-production-88975.up.railway.app/api`.
Especificación formal: `docs/openapi.yaml` (OpenAPI 3.0.3, 30 operaciones).

Convenciones:
- Éxito: `200` (o `201` al crear) con `{ "data": ... }` — las rutas de auth devuelven
  `{user, token, refresh_token}`.
- Error: `{ "error": { "code": <http>, "message": "…", "details": {…}? } }`.
- Todos los `id` son numéricos en el JSON (PostgreSQL los devuelve como texto; el
  backend los normaliza).

---

## 1. Salud

### `GET /health` — público
```json
{ "ok": true, "service": "despegar-api", "version": "v1", "roles": ["viajero","agente","admin"] }
```
Responde **sin tocar la base**: si PostgreSQL está caído, el health sigueOk (sirve
para el healthcheck de Railway).

---

## 2. Autenticación (público)

### `POST /register` — público
Body: `{nombre, email, password}` (nombre 2-100, email válido ≤160, password 8-72).
→ `201` `{user, token, refresh_token}`. El rol es **siempre `viajero`**.
Errores: `400` validación · `409` email duplicado · `429` cuota de altas.

### `POST /login` — público
Body: `{email, password}` → `200` `{user, token, refresh_token}`.
Errores: `400` faltan campos · `401` credenciales (mensaje genérico: no revela si el
email existe) · `403` cuenta desactivada · `429` cuota (por IP y por cuenta).

```bash
curl -X POST https://api-production-88975.up.railway.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@despegar.com","password":"Admin1234"}'
```

### `POST /refresh` — público
Body: `{refresh_token}` → `200` `{user, token, refresh_token}`.
**Rota el token**: el anterior queda revocado (no se puede reusar).
Errores: `401` inválido/expirado/reusado · `429` cuota.

### `POST /logout` — público
Body: `{refresh_token}` (opcional) → `200` `{data:{ok:true}}`. Revoca el refresh.

### `GET /me` — cualquier rol autenticado
→ `200` `{user:{id,nombre,email,rol,activo}}`. Errores: `401` sin token/inválido.

---

## 3. Viajero

### `GET /itinerario` — `viajero`
→ `200` `{data:[{id,codigo,tipo,origen,destino,hotel,fecha_inicio,fecha_fin,estado}]}`.
Errores: `401` sin token · `403` si es agente.

### `GET /incidentes/mios?estado=&page=&limit=` — `viajero`
→ `200` `{data:[...], total, page, limit}`.
Cada caso viene en **proyección pública**: sin `prioridad` real, sin `triado_por`,
sin `sla_vence_at`, sin `asignado_a`; sí con `prioridad_sugerida` y `prioridad_motivo`.

### `POST /incidentes` — `viajero`
Body: `{reserva_id?, tipo, titulo, descripcion}`.
- `tipo`: `Vuelo_cancelado|Vuelo_retrasado|Hotel_sin_reserva|Equipaje|Cobro_indebido|Fraude|Otro`
- `titulo` 5-120 · `descripcion` 10-2000
- `reserva_id` opcional, debe ser del usuario (si no: `404`)

→ `201` `{data:{incidente}}` con `estado:"Abierto"` y `prioridad:null` (sin triage).
Calcula `prioridad_sugerida` + `prioridad_motivo` por reglas.
Errores: `400` validación · `403` rol · `404` reserva ajena.

---

## 4. Detalle e hilo (dueño o agente/admin)

### `GET /incidentes/{id}` — `viajero` (solo el suyo) | `agente` | `admin`
- **Viajero**: `{data:{...incidente, atendido_por, historial:[{texto,creado_at}]}}`
  (historial **público**: solo claim, respuesta, estado, resuelto y reabierto; sin
  motivos internos).
- **Agente/admin**: `{data:{incidente, usuario, reserva, asignado, seguidores, siguiendo, mi_asignado}}`.

Errores: `401` · `403` recurso ajeno (viajero) · `404` no existe.

### `GET /incidentes/{id}/respuestas` — `viajero` (dueño) | `agente` | `admin`
→ `200` `{data:[{id,mensaje,creado_at,autor,autor_rol}]}` (hilo cronológico).

---

## 5. Agente (y admin)

### `GET /admin/incidentes?estado=&prioridad=&tipo=&orden=&page=&limit=` — `agente|admin`
Filtros (todos opcionales, se aplican **en el servidor**):
- `estado`: `Abierto|EnGestion|Resuelto|activos` (= todo lo no resuelto)
- `prioridad`: `Baja|Alta|Critica|sin_triar` (= `prioridad IS NULL`)
- `tipo`: uno de los 7
- `orden`: `urgencia` (defecto) · `asc` · `desc`

`orden=urgencia` = **SLA vencido → sin triage → Crítica → Alta → Baja → más antiguo**.

→ `200` `{data:[...], total, page, limit}`. Cada caso trae `asignado_a`,
`asignado_nombre`, `siguiendo` (¿lo sigo yo?) y `seguidores_count`.

### `GET /admin/incidentes/resumen` — `agente|admin`
→ `200` `{data:[{estado,prioridad,total}], sin_triar, vencidos, mios}`.
**Los tres contadores están en la raíz** (son globales, no de la página).

### `GET /admin/mi-cola?vista=mios|siguiendo&…` — `agente|admin`
- `vista=mios` → los casos que reclamé
- `vista=siguiendo` → los que sigo y **no** son míos
- sin `vista` → unión (asignados + seguidos)

Excluye los resueltos salvo `?estado=Resuelto`.
→ `200` `{data:[...], total, page, limit, vista}`.

### `GET /admin/agentes` — `agente|admin`
→ `200` `{data:[{id,nombre,email}]}` (agentes y admins activos).

### `GET /admin/incidentes/{id}` — `agente|admin`
→ `200` `{data:{incidente, usuario, reserva, asignado, seguidores, siguiendo, mi_asignado}}`.

### `PUT /admin/incidentes/{id}` — `agente|admin`
Body: `{prioridad?, estado?, motivo?}`.
- Prioridad → **triaje**: fija `triado_por`, `triado_at` y `sla_vence_at` (Crítica 4 h,
  Alta 24 h, Baja 72 h). El SLA **solo** se recalcula si la prioridad cambia.
- `estado: "Resuelto"` **exige prioridad previa** → `400` si no la hay.
- `motivo` → queda en el historial (se usa al reabrir).

→ `200` `{data:{incidente}}`.
Errores: `400` valor inválido o falta prioridad para resolver · `404` · `401` · `403`.

### `POST /admin/incidentes/{id}/claim` — `agente|admin`
Toma el caso: `asignado_a = yo`, `Abierto → EnGestion`, evento `claim`.
Atómico: `SELECT … FOR UPDATE` + `UPDATE … WHERE asignado_a IS NULL OR asignado_a = yo`.
→ `200` `{data:{incidente}}` · `409` si ya lo tiene otro agente · `404` si no existe.

### `POST /admin/incidentes/{id}/release` — `agente|admin`
Libera el caso (`asignado_a = NULL`), evento `release`. → `200` `{data:{incidente}}`.

### `POST /admin/incidentes/{id}/derivar` — `agente|admin`
Body: `{agente_id, motivo?}` → reasigna a otro agente (`agente` o `admin`).
→ `200` `{data:{incidente}}` · `400` si es el mismo destino · `404` si el destino no existe.

### `POST` / `DELETE /admin/incidentes/{id}/seguir` — `agente|admin`
Seguir / dejar de seguir un caso (idempotentes, cualquiera puede seguirlo).
→ `200` `{data:{incidente_id, siguiendo, seguidores, asignado}}`.

### `GET /admin/incidentes/{id}/respuestas` — `agente|admin`
→ `200` `{data:[hilo]}`.

### `POST /admin/incidentes/{id}/respuestas` — `agente|admin`
Body: `{mensaje}` (2-2000). Inserción atómica vía `crear_respuesta()`: la respuesta se
guarda y el caso pasa a `EnGestion` en la misma transacción.
→ `201` `{data:{id,incidente_id,mensaje,autor,autor_rol,creado_at}}`.

### `GET /admin/incidentes/{id}/historial` — `agente|admin`
→ `200` `{data:[{id,accion,detalle,creado_at,actor_id,actor_nombre}]}`.
Acciones: `creado, claim, release, derivar, seguir, dejar_seguir, responder, estado,
prioridad, triaje, resuelto, reabierto`.

---

## 6. Administración de usuarios (solo rol `admin`)

### `GET /admin/usuarios?rol=&q=&page=&limit=` — `admin`
Filtros: `rol=viajero|agente|admin` · `q` busca por nombre o email (ILIKE).
→ `200`
```json
{ "data": [ { "id": 28, "nombre": "Laura Admin", "email": "admin@despegar.com",
               "rol": "admin", "activo": true, "creado_at": "2026-10-21T…",
               "incidentes": 0, "asignados": 0 } ],
  "total": 13, "page": 1, "limit": 50 }
```
Errores: `401` · `403` (si no sos admin).

### `POST /admin/usuarios` — `admin`
Body: `{nombre, email, password, rol}` → **alta un usuario con el rol que elijas**
(agente, viajero o admin). Genera su access token y su refresh token para que pueda
entrar enseguida.
→ `201` `{data:{id,nombre,email,rol,activo}}`.
Errores: `400` validación · `409` email duplicado · `401` · `403`.

### `PUT /admin/usuarios/{id}` — `admin`
Body: `{rol?, activo?, password?, motivo?}` — cambios parciales, todos opcionales.
- `rol` → promueve/degrada (queda registrado con valor anterior y nuevo)
- `activo` → activa/desactiva (una cuenta desactivada no puede loguearse ni usar tokens)
- `password` → resetea la contraseña (8-72)
- `motivo` → se guarda en la auditoría

→ `200` `{data:{id,nombre,email,rol,activo}}`.
Errores: `400` valor inválido, o intento de cambiarte el propio rol / desactivar tu
cuenta · `409` si la base quedaría sin ningún admin activo · `404` si el usuario no existe.

### `GET /admin/usuarios/{id}/historial` — `admin`
→ `200`
```json
{ "data": [ { "id": 3, "usuario_id": 36, "actor_id": 28,
              "accion": "cambio_rol", "campo": "rol",
              "valor_anterior": "agente", "valor_nuevo": "admin",
              "detalle": "Ingreso al equipo de soporte",
              "creado_at": "2026-10-21T…",
              "usuario_nombre": "Nadia Agente", "actor_nombre": "Laura Admin" } ],
  "usuario": { "id": 36, "nombre": "Nadia Agente", "email": "…", "rol": "admin", "activo": true } }
```

### `GET /admin/historial?usuario_id=&limit=` — `admin`
Feed global de cambios (más reciente primero), para el panel "Cambios recientes".
→ `200` `{data:[...]}`.

---

## 7. Códigos de error

| Código | Cuándo | Ejemplo de mensaje |
|---|---|---|
| `200` | Ok | — |
| `201` | Creado | — |
| `204` | OPTIONS (preflight) | — |
| `400` | Validación o regla de negocio | "Prioridad requerida antes de resolver" |
| `401` | Sin token, inválido, expirado, usuario desactivado | "Token invalido o expirado" |
| `403` | Rol insuficiente o recurso ajeno | "Permiso denegado" |
| `404` | No existe | "Incidente no encontrado" |
| `405` | Método no permitido (con header `Allow`) | "Método no permitido para este endpoint" |
| `409` | Conflicto de estado | "El email ya está registrado" · "Caso ya asignado a otro agente" |
| `429` | Cuota excedida (con `Retry-After`) | "Demasiados intentos de login…" |
| `500` | Error interno (genérico, detalle solo en el log del servidor) | "Error interno del servidor" |

---

## 8. Chequeos rápidos con curl

```bash
BASE=https://api-production-88975.up.railway.app/api

# 1. health
curl $BASE/health

# 2. login de admin
TOK=$(curl -s -X POST $BASE/login -H "Content-Type: application/json" \
  -d '{"email":"admin@despegar.com","password":"Admin1234"}' | jq -r .token)

# 3. panel de usuarios
curl $BASE/admin/usuarios -H "Authorization: Bearer $TOK" | jq '.total, .data[0]'

# 4. alta de un agente
curl -X POST $BASE/admin/usuarios -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Agente Nuevo","email":"nuevo@despegar.com","password":"Prueba1234","rol":"agente"}'

# 5. promover a admin (queda auditado)
curl -X PUT $BASE/admin/usuarios/36 -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -d '{"rol":"admin","motivo":"Prueba"}'

# 6. historial de ese usuario
curl $BASE/admin/usuarios/36/historial -H "Authorization: Bearer $TOK" | jq '.data[0]'

# 7. 405 con header Allow
curl -i -X POST $BASE/me -H "Authorization: Bearer $TOK"
```
