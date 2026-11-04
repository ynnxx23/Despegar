# 02 — Arquitectura

## 1. Qué construimos

Un canal de soporte para incidentes críticos de viaje, con tres roles y trazabilidad
de punta a punta.

```
┌──────────────────────┐        ┌──────────────────────┐
│  App Viajero         │        │  App Agente/Admin    │
│  (Expo / RN)         │        │  (Expo / RN)         │
│  itiner·reportar     │        │  cola·triar·responder │
│  leer respuestas     │        │  administrar usuarios │
└──────────┬───────────┘        └──────────┬───────────┘
           │  HTTPS + Bearer JWT              │
           └───────────────┬──────────────────┘
                           ▼
           ┌───────────────────────────────────┐
           │  API REST — PHP 8.2 (sin fw)     │
           │  router · middleware · controllers│
           │  JWT HS256 · bcrypt · cuotas      │
           └───────────────┬───────────────────┘
                           ▼  PDO (prepared)
           ┌───────────────────────────────────┐
           │  PostgreSQL 15+                   │
           │  8 tablas · triggers · funciones  │
           └───────────────────────────────────┘
```

**Una sola API y una sola base** para las dos apps: el desacoplamiento está en los
roles (el rol viaja en el token y se revalida contra la base), no en dos backends.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión | Por qué esta |
|---|---|---|---|
| Móvil | Expo SDK | 57 | Es lo que pidió el enunciado; permite Expo Go (desarrollo) y build standalone (EAS) |
| Móvil | React Native | 0.86.3 | Ídem, y `FlatList` para listas virtualizadas |
| Móvil | React | 19.2.3 | — |
| Móvil | JavaScript (sin TypeScript) | — | Requisito del stack |
| Móvil | `expo-secure-store` | 57 | Tokens en el keychain del celu, **nunca** en AsyncStorage plano |
| Móvil | `react-native-safe-area-context` | 5.7 | Respetar notch y barra de gestos |
| Móvil | `fetch` (no Axios) | nativo | Sin dependencias; el interceptor de refresh queda explícito |
| Backend | PHP | 8.2 | Requisito; sin framework (evalúa POO/PDO) |
| Backend | PDO `pgsql` | — | Consultas preparadas (`ATTR_EMULATE_PREPARES=false`) |
| Backend | JWT HS256 manual | — | `hash_hmac` + `hash_equals`, sin `firebase/php-jwt` |
| Backend | bcrypt | cost 10-12 | Salt automático, cost configurable por env |
| Base | PostgreSQL | 15+ (local 18 · Railway 18 · compose 16) | Requisito: triggers, funciones, `TIMESTAMPTZ`, `JSONB` no usado a propósito |
| Deploy | Railway | CLI 5.x | API (Docker) + Postgres con volumen, 0 CPU cuando está pausado |
| Build | Docker | `php:8.2-cli` | Imagen mínima: runtime + `pdo_pgsql`, sin Apache ni Composer |
| CI | GitHub Actions | — | PostgreSQL 16 + PHP 8.2 + Node 20, sin secrets |
| Distribución | EAS Build | eas-cli 25 | APK Android compilado en la nube, instalable sin Play Store |
| Scripts | PowerShell 5.1 | — | Los `.cmd` de arranque para Windows (doble clic) |

**Cero dependencias de terceros en el backend.** El `Dockerfile` instala una sola cosa:
`libpq-dev` + `docker-php-ext-install pdo_pgsql`.

---

## 3. Estructura del repositorio

```
Despegar/
├── backend/                     API REST (PHP 8.2, sin framework)
│   ├── public/index.php         front-controller: tabla de rutas + middlewares
│   ├── src/
│   │   ├── Config.php           lector de .env sin librerías
│   │   ├── Database.php         singleton PDO (DB_* o DATABASE_URL)
│   │   ├── Middleware/Auth.php  Bearer + requireRole + revalidación de rol
│   │   ├── Models/              Usuario, Reserva, Incidente, GestionCaso,
│   │   │                        Respuesta, RefreshToken, Auditoria
│   │   ├── Controllers/         Auth, Itinerario, Incidentes, Admin, AdminUsuarios
│   │   └── Utils/               JwtHS256, Response, Cors, Security,
│   │                            RateLimit, Router
│   └── .env.example             placeholders (los secretos nunca se versionan)
├── apps/
│   ├── shared/                  ← CÓDIGO COMPARTIDO por las dos apps
│   │   ├── api.js               fetch + Bearer + refresh + timeout + errores legibles
│   │   ├── auth.js              SecureStore con adaptador memoria testeable
│   │   ├── session.js           useSession: arranque y cierre de sesión
│   │   ├── hooks.js             useApiList: carga + refresco + error
│   │   ├── components.js        Button, Input, Badge, Chip, Banner, FormScrollView…
│   │   ├── theme.js             tokens de diseño (contraste AA)
│   │   ├── format.js            etiquetas legibles, roles, fechas es-AR
│   │   └── LoginScreen.js       login parametrizable por rol
│   ├── viajero/                 App 1 (viajero): 7 pantallas
│   └── agente/                  App 2 (agente + admin): 4 pantallas + 2 paneles
├── db/
│   ├── schema.sql               schema v4 (fuente única) — incluye \ir seed_demo.sql
│   ├── seed_demo.sql            procedimiento sembrar_demo() (idempotente)
│   ├── seeds.sql                CALL sembrar_demo()
│   └── migrate_0*.sql           02..06: upgrades incrementales idempotentes
├── tests/                       F2/F3/F7/F8 (PowerShell) + suites Node
├── deploy/                      api-url.txt, init-db.ps1, railway-pause/resume.ps1
├── docs/                        documentación versionada (api, apps, instalacion, openapi)
├── .github/workflows/ci.yml     CI
├── start-viajero.cmd            doble clic: instala deps + Expo (URL API automática)
├── start-agente.cmd             ídem para la app de agente
├── start-railway.cmd            doble clic: prende la API en Railway
└── stop-railway.cmd             doble clic: la apaga (0 CPU/RAM)
```

**Monorepo sin workspaces:** las apps no son paquetes npm; comparten código por **ruta**
(`../shared/...`). Para que Metro lo resuelva, cada app tiene un `metro.config.js` con
`watchFolders: [workspaceRoot]` y `nodeModulesPaths` local (así cada app usa **sus**
versiones de dependencias y no hay un `node_modules` compartido).

---

## 4. Ciclo de vida de una request

Ejemplo: `PUT /api/admin/incidentes/42` con un JWT de agente.

```
1.  PHP built-in server (o el contenedor) recibe la request
2.  public/index.php
      ├─ require_once de los 20 archivos (autoload manual, sin Composer)
      ├─ Config::load(backend/.env)          → variables de entorno
      ├─ set_exception_handler(...)         → ninguna excepción filtra trace/SQL
      ├─ fail-fast: JWT_SECRET < 32 chars   → 500 genérico
      ├─ Security::applyHeaders()           → nosniff, DENY, CSP, HSTS
      ├─ Cors::apply()                      → según CORS_ORIGIN
      ├─ OPTIONS → 204
      ├─ /api/v1/... → se normaliza a /api/...
      ├─ GET /api/health → responde SIN tocar la base (si PG está caído, health responde)
      └─ Database::pdo()                    → singleton PDO
3.  Router::dispatch($db, $method, $path, bodyJson)
      ├─ busca la ruta que matchea el patrón  (ej. /api/admin/incidentes/{id})
      ├─ si el método no coincide → 405 + header Allow
      ├─ Auth::requireRole($db, ['agente','admin'])
      │     ├─ lee el header Authorization
      │     ├─ JwtHS256::decode()  → valida firma (hash_equals) y exp
      │     └─ Auth::rolVigente()  → SELECT rol FROM usuarios WHERE id = ?
      │            ↑ el rol sale de la BASE, no del token: degradar = acceso cortado
      └─ llama al controller con (db, claims, params, body, query)
4.  AdminController::actualizar()
      ├─ valida (prioridad/estado/motivo)      → 400 si no
      ├─ transacción: UPDATE incidentes + INSERT incidentes_eventos
      │     └─ el SLA solo se renueva si la prioridad CAMBÓ
      └─ Response::json()  → {data} + exit
5.  Volvemos al front-controller: nada más que ejecutar
```

Puntos clave del diseño:

- **Una sola puerta de entrada**: todo pasa por `index.php`; no hay lógica de negocio
  fuera de los controllers ni SQL fuera de los models.
- **La autenticación vive en el router**, no repetida en cada controller: declarar
  `['agente','admin']` en la ruta es lo único que hace falta para protegerla.
- **El rol se revalida contra la base en cada request** (1 SELECT barato) a cambio de
  que la revocación sea inmediata.
- **Las respuestas JSON son uniformes**: `Response::json()` y `Response::error()`
  terminan con `exit`, así que no hay que acordarse de hacer `return` en cada rama.

---

## 5. Capas y dependencias (regla de dependencias)

```
        index.php  (front-controller)
              │
              ├── Utils/Router ── Middleware/Auth ── Utils/JwtHS256
              │        │                                │
              │        └── Controllers ── Models ──────┴── Database ── Config
              │                    │
              └── Utils/Response, Cors, Security, RateLimit
```

Regla: **los controllers no hacen SQL** (van a los models) y **los models no conocen
HTTP** (no arman JSON). Un model devuelve arrays PHP; el controller decide qué exponer
(`Incidente::toPublic()` para el viajero vs `toAgent()` para el agente — el viajero
nunca ve la prioridad real ni el SLA).

---

## 6. Topología de despliegue

```
Internet
   │
   ├── https://api-production-88975.up.railway.app/api   (edge de Railway)
   │        │
   │        └── contenedor "api"  (Dockerfile: php:8.2-cli + pdo_pgsql)
   │                  │  PHP_CLI_SERVER_WORKERS=8
   │                  │  healthcheck cada 30 s (se puede desactivar)
   │                  ▼
   │             PostgreSQL (plugin, red privada, volumen postgres-volume 500 MB)
   │
   └── Celular: app instalada (APK) → HTTPS → misma URL
                 o Expo Go → Metro en la PC (Wi-Fi, tunnel opcional)
```

- **Sin conexión entre la app y la base**: la app habla HTTP con la API, y la API es
  la única que habla SQL. Por eso la app no necesita ni credenciales de base ni red
  local.
- **Un solo origen de verdad para la URL**: `deploy/api-url.txt` (versionado) →
  los `.cmd` la leen → la escriben en `apps/<app>/.env` → Expo la incrusta en el bundle.
  Para los builds de EAS, la URL va en `eas.json` (perfiles `preview`/`production`).

---

## 7. El flujo de un incidente (estado + triaje)

```
      易Viajero reporta
             │
             ▼
        [Abierto]  prioridad = NULL  (sin triage)
        prioridad_sugerida + prioridad_motivo  (reglas, no IA)
        sla_vence_at = NULL
             │
   ┌─────────┴──────────┐
   │ agente reclama     │ (claim atómico: FOR UPDATE + UPDATE condicional)
   ▼                    │
[EnGestion]             │
 asignado_a = agente    │
 sla_vence_at = NOW()+  │ (4 h Crítica · 24 h Alta · 72 h Baja)
                         │ ← el reloj se renueva SOLO si la prioridad cambia
   ┌─────────────────────┘
   │
   ▼
[Resuelto]   ← exige prioridad previa (400 si no)
   estado: Resuelto
   historial: claim, prioridad, triaje, responder, estado, resuelto, reabierto
```

Dos reglas de negocio que defienden la calidad del dato:

1. **No se resuelve sin triage** (`prioridad` no nula) → 400 con mensaje explícito.
2. **Reabrir exige motivo**: va en el body del PUT y queda en el historial del caso.

---

## 8. Decisiones de arquitectura en una línea

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Tabla de rutas propia | Laravel/Symfony | Evalúa POO y PDO; cero dependencias; build mínimo |
| JWT HS256 a mano | firebase/php-jwt | Mostrar el criptograma completo; sin Composer |
| Sin ORM | Doctrine/Eloquent | SQL visible y auditable; el enunciado pide PDO |
| Roles en la base, no en el token | Solo claims | Revocación inmediata al degradar una cuenta |
| Refresh token opaco + rotación | JWT de larga vida | Un token robado sirve una sola vez |
| Cuotas en archivo + `flock` | Contador en memoria | El server embebido corre N workers |
| `docs/openapi.yaml` | Contrato en markdown | Se puede validar y diffear |
| Suite de tests en Node | Solo PowerShell | Corre en Linux (CI) y en Windows |
