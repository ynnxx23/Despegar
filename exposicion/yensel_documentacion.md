# Documentación de Exposición — Despegar Grupo 8 (Carpeta /yensel)

> Contenido unificado de los 10 archivos de la carpeta `/yensel/`. Listo para abrir en LibreOffice y guardar como .odt.

---

# README.md

# Documentación privada del proyecto — Despegar Grupo 8

> **Carpeta NO versionada.** Está en `.git/info/exclude`, así que no entra al repo ni se sube a GitHub. Es material de trabajo para exponer el proyecto: puede editarse, ampliarse o borrarse sin romper nada.

> Reconstruirla en otra PC: cloná el repo y creá la carpeta `yensel/` (o cambiá el nombre en `.git/info/exclude`).

## Qué hay acá

| Archivo | Para qué lo usás | Cuándo lo mirás |
|---|---|---|
| `01-guion-de-exposicion.md` | Guion de la exposición: qué mostrar, en qué orden, con qué frases, y las preguntas que seguro van a hacer | Antes y durante la defensa |
| `02-arquitectura.md` | Stack tecnológico, estructura del repo, flujo de una request, decisiones de arquitectura | Cuando pregunten "¿cómo está hecho?" |
| `03-backend.md` | Router, middleware, controllers, models, JWT, refresh tokens, roles, cuotas, seguridad | Cuando pregunten por el backend / JWT / middleware |
| `04-base-de-datos.md` | Schema v4 completo: tablas, columnas, índices, triggers, funciones, migraciones, seed | Cuando pregunten por el modelo de datos |
| `05-apps.md` | Las dos apps Expo: capa compartida, sesión, pantallas, accesibilidad, build EAS | Cuando pregunten por el móvil |
| `06-api.md` | Referencia completa de endpoints, cuerpos, errores y códigos HTTP | Para consultar durante la demo |
| `07-despliegue-y-operacion.md` | Railway, Docker, CI, scripts, costos, cómo prender/apagar la API | Cuando pregunten "¿cómo lo desplegaron?" |
| `08-testing.md` | Qué tests existen, qué cubre cada uno, cómo correrlos, checklist manual | Cuando pregunten "¿cómo lo probaron?" |
| `09-decisiones-y-limitaciones.md` | Decisiones técnicas con su porqué, límites conocidos y trabajo futuro | Para responder "¿qué mejoraría?" |

## Datos rápidos

- **Nombre:** Despegar — Gestión de Incidentes Críticos (Grupo 8)
- **Alcance:** 2 apps móviles (Expo/React Native) + 1 API REST (PHP 8.2 sin framework) + 1 base PostgreSQL
- **Roles:** `viajero` (cliente), `agente` (soporte), `admin` (administra usuarios y agentes)
- **API en producción:** `https://api-production-88975.up.railway.app/api`
- **Repositorio:** `github.com/ynnxx23/Despegar` (rama `main`)
- **Cuentas de prueba:** `datos.md` (en la raíz del repo) — 2 admins, 4 agentes, 6 viajeros
- **Tests:** 58 checks en PowerShell + 16 en Node (API) + 4 en Node (cliente móvil) → **78 automatizados**
- **CI:** GitHub Actions (PostgreSQL + PHP + Node) en cada push
- **APK Android:** builds de EAS en los proyectos `@ynnxx23/despegar-viajero` y `@ynnxx23/despegar-agente`

## Cómo usar esta carpeta

1. Leé `01-guion-de-exposicion.md` y adaptalo a tu tiempo de exposición.
2. Tené a mano `06-api.md` (referencia de endpoints) y `datos.md` (credenciales de prueba: 2 admins, 4 agentes y 6 viajeros).
3. Para repasar lo técnico: `03-backend.md` (autenticación y autorización) y `04-base-de-datos.md` (modelo de datos y decisiones de integridad).
4. **No subas esta carpeta al repo.** Si en algún momento querés versionar parte de esto, copiala a `docs/` y hacé `git add -f`.

---

# 01-guion-de-exposicion.md

# 01 — Guion de exposición

Guía práctica para defender el proyecto. Ajustá los tiempos a los tuyos.

---

## 0. Antes de empezar (5 min)

- [ ] API **encendida**: doble clic en `start-railway.cmd` (deja todo andando y verificado). Si no lo tenés a mano: `deploy\railway-resume.ps1`.
- [ ] Celular con las apps **instaladas** (APK de EAS) o con Expo Go y Metro corriendo.
- [ ] `datos.md` abierto en otra pestaña: son las credenciales de prueba.
- [ ] `git log --oneline` a mano: la historia de commits habla sola (ver §7).

**Frase de apertura sugerida:**

> "El proyecto simula el canal de soporte de Despegar para incidentes críticos de viaje. Un viajero varado reporta el problema desde el celu; un agente de soporte lo ve en una cola priorizada por SLA, lo atiende y le responde; y un administrador da de alta los agentes. Todo lo armar es real: la API está desplegada en Railway con PostgreSQL."

---

## 1. Mapa de la demo (8-10 min)

| # | Qué mostrás | Dónde | Qué querés que se entienda |
|---|---|---|---|
| 1 | El problema de negocio y los 3 roles | este doc, §2 | Por qué existen 3 roles y no 2 |
| 2 | La app del viajero: login → itinerario → reportar | celu | Flujo del cliente, 3 pantallas |
| 3 | La **sugerencia de prioridad** automática | celu (crear incidente con "urgente") | El sistema es "inteligente" sin IA: reglas de negocio |
| 4 | La app del agente: cola ordenada por urgencia | celu | El corazón del producto: triage por SLA |
| 5 | **Reclamar** un caso → cambia de color/estado | celu | Concurrencia resuelta con `SELECT … FOR UPDATE` |
| 6 | **Responder** al viajero → el viajero lo ve | dos celus o recargar | Integración real entre las dos apps |
| 7 | **Resolver** con confirmación | celu | Regla de negocio: no se resuelve sin prioridad |
| 8 | El **panel de administración** (solo admin) | celu | El requisito de admins que registra agentes |
| 9 | Historial de cambios de usuario | celu | Trazabilidad: quién cambió qué y por qué |
| 10 | La API desde la terminal | `curl` | No es mocks: hay un backend de verdad |
| 11 | El CI y los tests | GitHub / terminal | Calidad medida, no declarada |

---

## 2. Pitch (2 min)

**Problema.** Un viajero que queda varado (vuelo cancelado, hotel sin reserva) o que sufre un cobro indebido pierde horas buscando un canal de soporte. Del lado de la empresa, los casos llegan mezclados y nadie sabe cuál es urgente.

**Solución.** Dos apps y un backend:

- **Portal Ayuda al Viajero** (`viajero`): itinerario, reporte de incidente con 7 tipos, lectura de respuestas en hilo.
- **Centro de Resolución** (`agente`): cola global ordenada por urgencia real (SLA vencido → sin triage → crítico → alta → baja), filtros, triaje, respuesta, derivación, cierre.
- **Panel de administración** (`admin`): alta de agentes, promoción de roles, activación/desactivación de cuentas y **historial de cambios**.

**Lo que lo distingue (decilo explícitamente):**

1. **El SLA es real y no se puede maquillar**: el reloj se renueva solo cuando la prioridad *cambia*, no cuando se re-guarda el caso. Un agente no puede "refrescar" una SLA vencida.
2. **El rol se revalida contra la base en cada request**: degradar una cuenta corta el acceso al instante, sin esperar a que expire el token.
3. **La trazabilidad es de verdad**: cada cambio de un usuario queda con actor, campo, valor anterior y nuevo, y motivo.
4. **Nada de mock**: la API está en Railway con PostgreSQL, hay CI que corre los tests en cada push, y hay APKs compilados en la nube de Expo.

---

## 3. Demo paso a paso (operativa)

### 3.1 Viajero

1. Abrí la app del viajero → login `ana@test.com` / `Viaje1234`.
2. **Viajes**: se ven 2 reservas (vuelo + hotel). Pull-to-refresh.
3. **Reportar**: elegí tipo *Vuelo cancelado*, escribí un título con la palabra "urgente" → la app sugiere prioridad. Enviá (pide confirmación).
4. **Incidentes**: aparece el caso nuevo con estado "Abierto".

### 3.2 Agente

5. Login `agente@despegar.com` / `Agente123`.
6. **Cola**: observá los chips de arriba (**Sin triar / Vencidos / Míos**) — son globales, calculados en el servidor, no de la página que estás viendo.
7. Ordená por "Urgentes": el caso vencido por SLA aparece primero.
8. Abrí un caso → **Reclamar** (pide confirmación) → pasa a "Lo tenés vos" y aparece en la pestaña **Míos**.
9. **Prioridad Crítica** → el SLA se recalcula a 4 h. Fijate en la fecha.
10. **Escribí una respuesta** → se suma al hilo.
11. **Marcar Resuelto** → pide confirmación y **exige prioridad previa** (probá resolver uno sin triage y mirá el error).
12. Volvé a la app del viajero: el estado cambió a "Resuelto" y aparece en el historial público del caso.

### 3.3 Admin

13. Login `admin@despegar.com` / `Admin1234`.
14. Pestaña **Administrar** (no la ve el agente: es por rol, no por pantalla).
15. **Registrar usuario nuevo** → creá `nuevo.agente@despegar.com` / `Prueba1234`, rol agente.
16. **Promover** a un viajero ya registrado: tocá el usuario → "Cambiar rol" → agente. Logueate con ese traveler: ahora entra como agente.
17. Abrí ese usuario → **Historial**: aparece quién hizo el cambio, el valor anterior y el nuevo, y el motivo.
18. Intentá desactivar tu propia cuenta → te lo impide (quedarte sin admins).

### 3.4 Backend (1 min, desde la terminal)

```bash
curl https://api-production-88975.up.railway.app/api/health
# {"ok":true,"service":"despegar-api","version":"v1","roles":["viajero","agente","admin"]}

# 405 real con header Allow
curl -i -X POST https://api-production-88975.up.railway.app/api/me -H "Authorization: Bearer <token>"
# HTTP/1.1 405 Method Not Allowed / Allow: GET

# El versioning
curl https://api-production-88975.up.railway.app/api/v1/health   # mismo comportamiento
```

---

## 4. Preguntas que seguro van a hacer (y qué responder)

**"¿Por qué PHP sin framework / sin Laravel?"**

Decisión deliberada y justificada en el plan: el proyecto evalúa POO, PDO y criptografía sobre frameworks. `index.php` + tabla de rutas propia, sin Composer, cero dependencias externas: el contenedor de build es `php:8.2-cli` con `pdo_pgsql` y nada más.

**"¿Por qué JWT HS256 a mano si existe firebase/php-jwt?"**

Para no agregar dependencias ni Composer al build, y para poder mostrar el criptograma completo: `base64url(header).base64url(payload).HMAC-SHA256(secret)`, validación con `hash_equals` y rechazo explícito de `alg != HS256`. Está en `backend/src/Utils/JwtHS256.php` (47 líneas).

**"¿Cómo evitás que un agente se lleve el caso de otro?"**

Dos mecanismos: (a) el claim es atómico — `UPDATE … WHERE id=? AND (asignado_a IS NULL OR asignado_a=?)` dentro de una transacción con `SELECT … FOR UPDATE` sobre la fila; (b) si ya está asignado a otro, la API responde **409** y la app lo muestra.

**"¿Qué pasa si alguien degrada a un agente en pleno uso?"**

El token JWT sigue siendo válido hasta 8 h, pero **el rol se revalida contra la base en cada request** (`Auth::rolVigente`). En la siguiente llamada, ese token recibe 403.

**"¿Cómo guardás las contraseñas?"**

bcrypt con salt automático (cost 10-12, configurable). Nunca se devuelven ni se registran: la proyección `Usuario::toSafe()` expone solo id, nombre, email, rol y activo.

**"¿Y los refresh tokens?"**

Opaque (32 bytes aleatorios), la base guarda **solo el SHA-256**. Rotan en cada uso: el anterior queda revocado, así que un token robado sirve una sola vez. 30 días de vida.

**"¿Tenés rate limiting?"**

Sí, y con archivo + `flock`, no en memoria: el server embebido de PHP corre varios workers (`PHP_CLI_SERVER_WORKERS=8`) y un contador en memoria contaría por proceso. El límite es por IP y por cuenta: login 30/min por IP y 20/min por cuenta, registro 30/h. Al superarlo → **429** con `Retry-After`.

**"¿Cómo probaron que no se rompe?"**

78 checks automatizados: 58 en PowerShell (auth, dominio, integración, gestión), 16 en Node (portable, es lo que corre el CI) y 4 del cliente móvil. El CI levanta PostgreSQL, aplica el schema, levanta la API y corre todo en cada push. Aparte, un checklist manual de 9 puntos en el dispositivo.

**"¿Qué falta / qué mejorarías?"**

Tené la respuesta lista en `09-decisiones-y-limitaciones.md`: no hay tests end-to-end sobre dispositivo, la API es síncrona (un worker bloquea la request), no hay observabilidad (solo `error_log`), y la sugerencia de prioridad son reglas, no un modelo. Decilo con honestidad: es lo que atacaría primero.

**"¿Por qué el chatbot / la IA que había en el repo desaparecieron?"**

Porque el alcance del grupo es el del borrador (viajero + agente + admin): el código de IA/chatbot/adjuntos que estaba en una copia quedó fuera de alcance, no registrado en el router y sin tests. Se eliminó para no entregar código muerto.

---

## 5. Preguntas feas (razonables) y cómo responder

- **"¿Cómo escalaría esto?"** → Hoy: PHP embebido con N workers + PostgreSQL único. Mañana: réplicas de lectura, cola de trabajo (la parte de IA/OCR es la candidata natural a asíncrono), y cache de la cola. Escribí lo que harías, no lo que ya hiciste.
- **"¿Por qué no usaste Axios?"** → `fetch` nativo alcanza, y con un interceptor manual queda más explícito el flujo de refresh (reintento único, refresco compartido entre requests concurrentes).
- **"¿Cómo probás la concurrencia?"** → A nivel de código, con `FOR UPDATE` y el `UPDATE` condicional; a nivel de test, el suite de Node cubre el 409 del claim. Lo que falta es un test de carga real con dos clientes concurrentes.
- **"¿Por qué guardás la API en Railway?"** → Facilidad de despliegue y costo: el plan gratuito con un Postgres de 500 MB y un sleep automático. Además, pausar con un script deja de facturar cuando no se demo (ver `07-despliegue-y-operacion.md`).

---

## 6. Plan B (si algo falla en la demo)

| Fallo | Plan B |
|---|---|
| Railway no levanta | `start-railway.cmd`; si falla, `deploy\railway-resume.ps1` a mano. La API local es plan C: `php -S 0.0.0.0:8000 -t backend/public` + `start-viajero.cmd local` |
| El celu no conecta | La app instalada apunta a Railway: comprobá que esté encendida. Con Expo Go: reiniciá Metro (la URL va incrustada en el bundle) |
| Se colgó la sesión | Salí y volvé a entrar (el refresh rota solo, pero tras 3 refresh fallidos se cierra) |
| No hay red | Todo el backend es local con `docker compose up --build` |

---

## 7. Para cerrar (30 seg)

> "Lo que más nos costó fue que el sistema no permitiera hacer trampa: el SLA no se renueva si no cambia la prioridad, dos agentes no pueden tomar el mismo caso, y cualquier cambio de rol queda registrado con autor y motivo. Y todo eso está automatizado: 78 tests, un CI que corre en cada push, y la API real desplegada."

Y dejá abierta la pregunta: *"¿querés que les muestre la parte de la base de datos o preferís que vea el panel de administración?"*

---

# 02-arquitectura.md

# 02 — Arquitectura

## 1. Qué construimos

Un canal de soporte para incidentes críticos de viaje, con tres roles y trazabilidad de punta a punta.

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

**Una sola API y una sola base** para las dos apps: el desacoplamiento está en los roles (el rol viaja en el token y se revalida contra la base), no en dos backends.

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

**Cero dependencias de terceros en el backend.** El `Dockerfile` instala una sola cosa: `libpq-dev` + `docker-php-ext-install pdo_pgsql`.

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

**Monorepo sin workspaces:** las apps no son paquetes npm; comparten código por **ruta** (`../shared/...`). Para que Metro lo resuelva, cada app tiene un `metro.config.js` con `watchFolders: [workspaceRoot]` y `nodeModulesPaths` local (así cada app usa **sus** versiones de dependencias y no hay un `node_modules` compartido).

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

- **Una sola puerta de entrada**: todo pasa por `index.php`; no hay lógica de negocio fuera de los controllers ni SQL fuera de los models.
- **La autenticación vive en el router**, no repetida en cada controller: declarar `['agente','admin']` en la ruta es lo único que hace falta para protegerla.
- **El rol se revalida contra la base en cada request** (1 SELECT barato) a cambio de que la revocación sea inmediata.
- **Las respuestas JSON son uniformes**: `Response::json()` y `Response::error()` terminan con `exit`, así que no hay que acordarse de hacer `return` en cada rama.

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

Regla: **los controllers no hacen SQL** (van a los models) y **los models no conocen HTTP** (no arman JSON). Un model devuelve arrays PHP; el controller decide qué exponer (`Incidente::toPublic()` para el viajero vs `toAgent()` para el agente — el viajero nunca ve la prioridad real ni el SLA).

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

- **Sin conexión entre la app y la base**: la app habla HTTP con la API, y la API es la única que habla SQL. Por eso la app no necesita ni credenciales de base ni red local.
- **Un solo origen de verdad para la URL**: `deploy/api-url.txt` (versionado) → los `.cmd` la leen → la escriben en `apps/<app>/.env` → Expo la incrusta en el bundle. Para los builds de EAS, la URL va en `eas.json` (perfiles `preview`/`production`).

---

## 7. El flujo de un incidente (estado + triaje)

```
      Viajero reporta
             │
             ▼
       [Abierto]  prioridad = NULL  (sin triage)
       prioridad_sugerida + prioridad_motivo  (reglas, no IA)
       sla_vence_at = NULL
             │
    ┌────────┴────────┐
    │ agente reclama  │ (claim atómico: FOR UPDATE + UPDATE condicional)
    ▼                 │
 [EnGestion]          │
 asignado_a = agente  │
 sla_vence_at = NOW()+│ (4 h Crítica · 24 h Alta · 72 h Baja)
                      │ ← el reloj se renueva SOLO si la prioridad cambia
    ┌─────────────────┘
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

---

# 03-backend.md

# 03 — Backend: cómo funciona por dentro

Archivos: `backend/` (24 archivos PHP, ~90 KB). Sin framework, sin Composer, sin dependencias.

---

## 1. El router (`backend/src/Utils/Router.php`)

Una tabla de rutas: método → patrón → `{roles, handler}`.

```php
$router->get('/api/admin/incidentes/resumen', ['agente','admin'], [AdminController::class,'resumen']);
$router->get('/api/admin/incidentes/{id}',      ['agente','admin'], [AdminController::class,'ver']);
$router->put('/api/admin/incidentes/{id}',      ['agente','admin'], [AdminController::class,'actualizar']);
```

Características:

- **Patrones con parámetros**: `{id}` se compila a `(?P<id>[^/]+)`. Los handlers reciben `$params` ya parseado.
- **Orden de declaración importa**: las rutas literales (`/resumen`) se declaran antes que las genéricas (`/{id}`), así que `/admin/incidentes/resumen` no se confunde con un incidente llamado "resumen".
- **405 real**: si el path matchea pero el método no, responde `405` con el header `Allow: GET, POST`. Antes devolvía un `404` genérico.
- **Roles declarativos**: `['agente','admin']` → el router llama a `Auth::requireRole()` antes del handler. `null` = ruta pública.
- **Versionado**: `/api/v1/...` es alias exacto de `/api/...` (se normaliza el path).
- **Argumentos por prefijo**: el handler recibe `(db, claims, params, body, query)` y el router recorta el prefijo según lo que el handler declare (vía `ReflectionMethod`). Es una salvaguarda: si alguien declara mal la firma, el error es visible y no silencioso.

```php
// Router::dispatch (resumen)
foreach ($this->routes as $m => $porPatron) {
  foreach ($porPatron as $patron => $ruta) {
    if (!preg_match($this->regex($patron), $path, $mch)) continue;
    if ($m !== $metodo) { $permitidos[] = $m; continue; }   // → 405
    $claims = $ruta['roles'] ? Auth::requireRole($db, $ruta['roles']) : [];
    call_user_func_array($ruta['handler'], [/* prefijo recortado */]);
  }
}
```

---

## 2. Middleware de autenticación (`backend/src/Middleware/Auth.php`)

```php
Auth::requireRole(PDO $db, array $roles): array
```

1. `bearer()` — extrae `Authorization: Bearer <jwt>` (soporta `getallheaders()`).
2. `JwtHS256::decode()` — valida firma y expiración. Si falla → **401**.
3. `rolVigente()` — **consulta la base**: `SELECT rol, activo FROM usuarios WHERE id = ?`.
   - usuario inexistente → 401
   - `activo = false` → 401
4. Si el rol vigente no está en la lista pedida → **403**.

Diferencia 401 vs 403 (decila si preguntan):

| Situación | Código | Significado |
|---|---|---|
| Sin header, token inválido/expirado, usuario inexistente o desactivado | **401** | "No sé quién sos" (o tu credencial ya no sirve) |
| Identidad válida pero sin permiso para este recurso | **403** | "Sé quién sos, pero no podés" |

**La revalidación del rol en cada request** es la decisión que hace que "degradar una cuenta" funcione al instante, sin esperar a que expire el JWT (8 h). Cuesta 1 SELECT por request: aceptable para este volumen, y es lo que el enunciado pedía ("control de roles, token de viajero NO accede a endpoints admin").

Compatibilidad: si una base vieja no tiene la columna `activo`, el middleware lo detecta (código SQLSTATE 42703) y sigue consultando solo el rol.

---

## 3. JWT HS256 implementado a mano (`backend/src/Utils/JwtHS256.php`)

47 líneas, sin dependencias.

```php
// Firma
$h = b64u(json_encode(['alg'=>'HS256','typ'=>'JWT']));
$p = b64u(json_encode($claims));
$sig = b64u(hash_hmac('sha256', "$h.$p", $secret, true));

// Verificación (decode)
if ($header['alg'] !== 'HS256') return null;                 // alg confusion
if (!hash_equals($expected, $sig)) return null;              // timing-safe
if ($claims['exp'] < time()) return null;                     // expirado
if ($claims['iat'] > time() + 60) return null;                // reloj hacia futuro
```

- `base64url` con `rtrim(strtr(base64_encode($b), '+/', '-_'), '=')`.
- Claims: `{sub, rol, iat, exp}`. **Nunca** password ni datos sensibles.
- `sub` numérico, `rol` debe ser uno de `viajero|agente|admin` (lista cerrada).
- La vida se acota: `JWT_TTL_HOURS` entre 1 y 24 (defecto 8).
- Fail-fast: si `JWT_SECRET` mide menos de 32 caracteres, la API **no opera** (500 genérico, el valor nunca se expone).

---

## 4. Refresh tokens (`backend/src/Models/RefreshToken.php`)

| Aspecto | Implementación |
|---|---|
| Generación | `bin2hex(random_bytes(32))` → 64 hex |
| Almacenamiento | **solo el SHA-256** en `refresh_tokens.token_hash` (UNIQUE) |
| Vida | 30 días (`REFRESH_TTL_DAYS`, entre 1 y 90) |
| Rotación | `rotar()` marca el viejo como revocado y emite uno nuevo en la misma operación |
| Revocación | `POST /api/logout` revoca el token que le mandes |
| Limpieza | `purgar()` borra vencidos y revocados viejos (se llama en cada login) |

**Reuso = 401**: si alguien captura un refresh token y lo usa dos veces, la segunda falla (el primero ya quedó revocado). Es la propiedad de "rotación de un solo uso".

---

## 5. Controllers

| Controller | Endpoints | Responsabilidad |
|---|---|---|
| `AuthController` | `/register` `/login` `/refresh` `/logout` `/me` | Sesión. Registra **solo viajeros** (el alta de agentes es del admin). Aplica cuotas. Login genérico (no revela si el email existe) |
| `ItinerarioController` | `/itinerario` | Las reservas del viajero (solo lectura) |
| `IncidentesController` | `/incidentes/mios` `/incidentes` `/incidentes/:id` `/incidentes/:id/respuestas` | Dominio del viajero. Al crear calcula la **prioridad sugerida**; en la proyección `toPublic()` **nunca** expone la prioridad real, el SLA ni el triaje |
| `AdminController` | `/admin/incidentes*` `/admin/mi-cola` `/admin/agentes` | Cola, triaje, SLA, respuesta, claim/release/derivar/seguir, historial |
| `AdminUsuariosController` | `/admin/usuarios*` `/admin/historial` | **Solo rol admin**: alta de usuarios, cambio de rol, activar/desactivar, reset de contraseña, historial de cambios |

### Validaciones (las que se ven en el código)

| Dato | Regla | Dónde |
|---|---|---|
| Nombre | 2-100 caracteres | `AuthController`, `AdminUsuariosController` |
| Email | `FILTER_VALIDATE_EMAIL`, máx 160, único (409) | ambos |
| Password | 8-72 caracteres (límite de bcrypt), bcrypt cost 10-12 | ambos |
| Título de incidente | 5-120 | `IncidentesController` |
| Descripción | 10-2000 | `IncidentesController` |
| Tipo de incidente | lista cerrada de 7 valores | `IncidentesController` |
| Prioridad | `Baja|Alta|Critica` | `AdminController` |
| Estado | `Abierto|EnGestion|Resuelto` | `AdminController` |
| Motivo | máx 300 caracteres | `AdminController`, `AdminUsuariosController` |
| Rol | `viajero|agente|admin` | `AdminUsuariosController` |

---

## 6. Models

| Model | Tabla | Qué aporta |
|---|---|---|
| `Usuario` | `usuarios` | Búsqueda, listado para el panel, cambios de rol/activo/password, conteo de admins |
| `Reserva` | `reservas` | Itinerario del viajero; `belongsTo()` para validar que la reserva del incidente sea propia |
| `Incidente` | `incidentes` | Sugerencia de prioridad, cola con filtros de servidor, SLA, orden de urgencia |
| `GestionCaso` | `incidentes_eventos`, `incidente_seguidores` | Quién atiende el caso, quiénes lo siguen, historial (público y interno) |
| `Respuesta` | `respuestas` | Hilo 1:N; inserción atómica vía función SQL |
| `RefreshToken` | `refresh_tokens` | Emisión, rotación, revocación, purga |
| `Auditoria` | `usuarios_auditoria` | Historial de cambios de usuarios |

### Proyecciones (qué ve cada rol)

```php
Incidente::toPublic($row)  // viajero: quita prioridad, triado_por, triado_at, sla_vence_at, asignado_a
Incidente::toAgent($row)   // agente: fila completa
Usuario::toSafe($row)      // todos: id, nombre, email, rol, activo (¡sin hash!)
```

---

## 7. Reglas de negocio que vale la pena explicar

### 7.1 Sugerencia de prioridad (sin IA)

Base por tipo +keyword bump:

| Tipo | Base | | Tipo | Base |
|---|---|---|---|---|
| `Fraude` | Crítica | | `Hotel_sin_reserva` | Alta |
| `Vuelo_cancelado` | Alta | | `Equipaje` | Alta |
| `Cobro_indebido` | Alta | | `Vuelo_retrasado` | Baja |
| | | | `Otro` | Baja |

Keywords que suben **un** nivel (tope: Crítica): `urgente, varad, hoy, ahora, estafa, menor, salud, hospital, embarazada, discapacidad`.

La sugerencia **nunca** decide la prioridad real: el caso entra con `prioridad = NULL` (sin triage) y la prioridad la pone un agente. El viajero ve la sugerencia como "orientación", no como promesa.

### 7.2 Claim atómico (concurrencia)

```php
$db->beginTransaction();
SELECT asignado_a, estado FROM incidentes WHERE id = ? FOR UPDATE;   // lock de fila
if ($asignado !== null && $asignado !== $yo) → 409 "Caso ya asignado a otro agente"
UPDATE incidentes SET asignado_a = ? WHERE id = ? AND (asignado_a IS NULL OR asignado_a = ?);
if (rowCount() === 0) → 409
if ($estado === 'Abierto') UPDATE ... SET estado = 'EnGestion';
INSERT INTO incidentes_eventos (...);   // evento 'claim'
$db->commit();
```

`FOR UPDATE` serializa a los dos agentes que cliccan "Reclamar" a la vez: el segundo espera al lock y, cuando lo obtiene, ve que ya está asignado → 409.

### 7.3 El SLA no se renueva solo

```php
// AdminController::actualizar
$cambiaPrioridad = $prioridad !== null && $prioridad !== $actual['prioridad'];
$m->update($id, $prioridad, $estado, $actor, $cambiaPrioridad);
//                                        ↑ solo recalcula sla_vence_at si cambió la prioridad
```

Si no, un agente podía re-guardar el caso y "refrescar" el reloj de un SLA vencido: el caso dejaba de contar como vencido sin que nadie lo hubiera atendido. **El SLA mide el tiempo desde el triage real, no desde el último guardado.**

### 7.4 Transacciones donde importan

| Operación | Qué va atómico |
|---|---|
| `actualizar` | UPDATE del incidente + INSERT de los eventos (prioridad/triaje/estado/resuelto/reabierto) |
| `claim` | lock + update de asignado + cambio de estado + evento |
| `release` | UPDATE + evento |
| `derivar` | lock + update + evento con motivo |
| `responder` | Inserción de la respuesta + cambio a `EnGestion` en la función SQL `crear_respuesta()` |

Si algo falla a mitad, `rollBack()` y no queda el caso a medias (por ejemplo: prioridad cambiada pero sin evento en el historial).

---

## 8. Seguridad (capa HTTP)

### Cuotas (`Utils/RateLimit.php`)

| Regla | Límite | Ventana | Clave |
|---|---|---|---|
| Login | 30 | 60 s | IP |
| Login | 20 | 60 s | cuenta (email) |
| Registro | 30 | 3600 s | IP |
| Refresh | 60 | 60 s | IP |

Al superarlas → **429** con `Retry-After` y `details.reintenta_en_segundos`. Configurables por env (`LOGIN_RATE_LIMIT`, `LOGIN_RATE_ACCOUNT_LIMIT`, `REGISTER_RATE_LIMIT`, `REFRESH_RATE_LIMIT`, y las ventanas).

**Por qué en archivo y no en memoria**: el server embebido de PHP levanta N workers (`PHP_CLI_SERVER_WORKERS=8`), y cada worker es un proceso separado: un contador en memoria contaría por proceso (8 veces el límite). El archivo con `flock` es atómico entre procesos. Si el directorio no es escribible, el limitador hace *fail-open* y queda logueado.

### Headers (`Utils/Security.php`)

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-site
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains   (solo si es HTTPS)
```

### CORS (`Utils/Cors.php`)

Configurable por `CORS_ORIGIN`:

- vacío (defecto) → **no** se manda ninguna cabecera CORS (solo apps nativas).
- `*` → cualquier origen (solo dev; con `APP_ENV=production` queda logueado como aviso).
- lista separada por comas → allowlist exacta.

### Errores

- Handler global: cualquier excepción no controlada → **500 genérico** + `error_log` con el detalle. Nunca sale un trace ni un SQL al cliente.
- `Response::error($mensaje, $codigo, $details = [])` → `{"error":{"code","message","details"?}}`.
- `Response::json($data, $codigo)` → `{"data": ...}` y `exit`.

---

## 9. Variables de entorno

| Variable | Defecto | Para qué |
|---|---|---|
| `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASS` | `127.0.0.1:5432/despegar` | Conexión local |
| `DATABASE_URL` | — | Alternativa (Railway): tiene prioridad si `DB_HOST` está vacío |
| `JWT_SECRET` | — | **Obligatoria**, ≥32 chars. La API no arranca sin ella |
| `BCRYPT_COST` | 10 | 10-12 |
| `JWT_TTL_HOURS` | 8 | 1-24 |
| `REFRESH_TTL_DAYS` | 30 | 1-90 |
| `APP_ENV` | `development` | `production` activa el aviso de CORS abierto |
| `CORS_ORIGIN` | vacío | Allowlist |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_ACCOUNT_LIMIT` / `REGISTER_RATE_LIMIT` / `REFRESH_RATE_LIMIT` | 30/20/30/60 | Cuotas |

`.env` está en `.gitignore` (y `.env.*` también, salvo `.env.example`), así que los secretos nunca entran al repo.

---

## 10. Puntos del backend que todavía se pueden mejorar

- **Sin observabilidad**: solo `error_log` (texto plano). Falta logging estructurado con request-id y métricas (latencia, errores por código).
- **Síncrono**: un request PHP bloquea un worker. Con 8 workers y carga de demo va bien; para producción faltaría una cola o PHP-FPM con pool.
- **Sin caché**: el resumen de la cola hace 4 queries en cada llamada; con volumen real convendría cachearlo o materializarlo.
- **Sin versionado real del esquema**: hay alias `/api/v1`, pero el schema evoluciona con migraciones numeradas; un cliente viejo con un payload viejo no está soportado.

---

# 04-base-de-datos.md

# 04 — Base de datos

PostgreSQL 15+ · schema **v4** · 8 tablas · 13 índices · 2 triggers · 8 rutinas · 1 procedimiento.

---

## 1. Diagrama de entidades

```
        ┌──────────────┐
        │   usuarios   │  rol: viajero | agente | admin
        │  id (PK)     │  activo BOOLEAN
        │  nombre      │
        │  email (U)   │
        │  password_   │
        │    hash      │
        └──┬───┬───┬───┘
           │   │   │
    1:N     │   │   │     1:N            ┌──────────────┐
   ┌────────┘   │   └──────────┐         │  usuarios_   │
   │            │              │         │  auditoria   │  (actor_id, usuario_id)
   ▼            ▼              ▼         │  accion      │
┌───────────┐ ┌────────────┐ ┌─────────┴──────────────┐
│ reservas  │ │ incidentes │ │  refresh_tokens        │
│ user_id   │ │ user_id    │ │  usuario_id            │
│ tipo      │ │ reserva_id │ │  token_hash (U, SHA256)│
│ codigo    │ │ tipo       │ │  expira_at             │
│ origen/   │ │ titulo     │ │  revocado_at           │
│ destino/  │ │ descripcion│ └────────────────────────┘
│ hotel     │ │ prioridad  │
│ fecha_ini │ │ estado     │        ┌────────────────────┐
│ fecha_fin │ │ prioridad_ │        │ incidente_         │
│ estado    │ │  sugerida  │        │  seguidores        │
└───────────┘ │ motivo     │        │ (incidente_id,     │
              │ triado_por │        │  agente_id) PK     │
              │ triado_at  │        └────────────────────┘
              │ sla_vence_ │        ┌────────────────────┐
              │  at        │        │ incidente_eventos  │
              │ asignado_a │        │ (incidente_id,     │
              │ creado_at  │        │  actor_id, accion, │
              │ actualizado│        │  detalle)          │
              │  _at       │        └────────────────────┘
              └─────┬──────┘        ┌────────────────────┐
                    │ 1:N            │    respuestas      │
                    └───────────────▶│ (incidente_id,    │
                                      │  autor_id,        │
                                      │  mensaje)         │
                                      └────────────────────┘
```

Reglas de borrado: `reservas`, `incidentes`, `respuestas`, `refresh_tokens` y `usuarios_auditoria` → **CASCADE** desde `usuarios`; `incidentes.reserva_id` → **SET NULL** (borrar una reserva no borra el reporte del viajero); `incidentes.asignado_a` y `triado_por` → **SET NULL**; `incidente_eventos.actor_id` → **SET NULL** (el historial sobrevive al borrado del actor).

---

## 2. Tablas en detalle

### `usuarios`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | `INT GENERATED BY DEFAULT AS IDENTITY` | PK |
| `nombre` | `VARCHAR(100)` | `CHECK (char_length BETWEEN 2 AND 100)` |
| `email` | `VARCHAR(160)` | `UNIQUE` + `CHECK (email LIKE '%@%.%')` |
| `password_hash` | `VARCHAR(255)` | bcrypt (60 chars) |
| `rol` | `VARCHAR(10)` | `CHECK (rol IN ('viajero','agente','admin'))` — el rol se valida en el CHECK, no solo en la app |
| `activo` | `BOOLEAN DEFAULT TRUE` | Una cuenta desactivada no puede iniciar sesión ni usar tokens |
| `creado_at` | `TIMESTAMPTZ` | `DEFAULT CURRENT_TIMESTAMP` |

### `reservas`
`id`, `user_id` (FK CASCADE), `tipo` (`vuelo|hotel`), `codigo` (VARCHAR 20), `origen`, `destino`, `hotel`, `fecha_inicio` (DATE), `fecha_fin` (DATE), `estado` (VARCHAR 20, def. `Confirmada`), `creado_at`.

### `incidentes`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | IDENTITY | PK |
| `user_id` | `INT` | FK → `usuarios` CASCADE (dueño) |
| `reserva_id` | `INT NULL` | FK → `reservas` SET NULL |
| `tipo` | `VARCHAR(20)` | `CHECK` de los 7 valores |
| `titulo` | `VARCHAR(120)` | `CHECK (char_length BETWEEN 5 AND 120)` |
| `descripcion` | `TEXT` | `CHECK (char_length BETWEEN 10 AND 2000)` |
| `prioridad` | `VARCHAR(10) NULL` | `CHECK (Baja|Alta|Critica)`; **NULL = sin triage** |
| `estado` | `VARCHAR(10)` | `CHECK (Abierto|EnGestion|Resuelto)`, def. `Abierto` |
| `prioridad_sugerida` | `VARCHAR(10) NULL` | Lo calcula el sistema al crear (reglas) |
| `prioridad_motivo` | `TEXT NULL` | Por qué la sugirió (ej. "palabras: urgente, hoy") |
| `triado_por` | `INT NULL` | FK → `usuarios` SET NULL |
| `triado_at` | `TIMESTAMPTZ NULL` | Cuándo se trió |
| `sla_vence_at` | `TIMESTAMPTZ NULL` | Primer deadline: `NOW() + 4/24/72 h` según prioridad |
| `asignado_a` | `INT NULL` | FK → `usuarios` SET NULL (el agente que lo lleva) |
| `creado_at` / `actualizado_at` | `TIMESTAMPTZ` | `actualizado_at` lo mantiene el trigger |

### `respuestas`
`id`, `incidente_id` (FK CASCADE), `autor_id` (FK CASCADE), `mensaje` (TEXT, `CHECK 2..2000`), `creado_at`.

### `incidente_eventos`
Historial del caso: `id` (SERIAL), `incidente_id` (FK CASCADE), `actor_id` (FK SET NULL), `accion` (VARCHAR 30), `detalle` (TEXT), `creado_at`.
Acciones: `creado, claim, release, derivar, seguir, dejar_seguir, responder, estado, prioridad, triaje, resuelto, reabierto`.

### `incidente_seguidores`
`incidente_id` + `agente_id` (PK compuesta) + `creado_at`. Un agente puede seguir cualquier caso, tenga o no el caso asignado.

### `refresh_tokens`
`id`, `usuario_id` (FK CASCADE), `token_hash` (VARCHAR 64 **UNIQUE**, SHA-256), `expira_at`, `revocado_at`, `creado_at`. El token crudo solo existe en el cliente.

### `usuarios_auditoria` (nueva en v4)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | IDENTITY | PK |
| `usuario_id` | `INT NULL` | FK → `usuarios` SET NULL (el usuario afectado) |
| `actor_id` | `INT NULL` | FK → `usuarios` SET NULL (quién hizo el cambio) |
| `accion` | `VARCHAR(40)` | `crear_usuario, cambio_rol, activar, desactivar, reset_password, registro_publico` |
| `campo` | `VARCHAR(40) NULL` | `rol`, `activo`, `password`… |
| `valor_anterior` | `TEXT NULL` | |
| `valor_nuevo` | `TEXT NULL` | |
| `detalle` | `TEXT NULL` | Motivo que escribió el admin |
| `creado_at` | `TIMESTAMPTZ` | |

---

## 3. Índices (13)

| Índice | Tabla | Columnas | Por qué |
|---|---|---|---|
| `idx_reservas_user` | reservas | (user_id) | Itinerario del viajero |
| `idx_incidentes_user` | incidentes | (user_id) | "Mis incidentes" |
| `idx_incidentes_cola` | incidentes | (estado, prioridad, creado_at) | La cola: filtro + orden |
| `idx_incidentes_asignado` | incidentes | (asignado_a) | "Míos" y conteos |
| `idx_incidentes_sla` | incidentes | (sla_vence_at) **parcial** (`WHERE sla_vence_at IS NOT NULL`) | Ordenar por SLA vencido sin penalizar los NULL |
| `idx_incidentes_tipo` | incidentes | (tipo) | Filtro por tipo en la cola |
| `idx_respuestas_incidente` | respuestas | (incidente_id) | Hilo del caso |
| `idx_eventos_incidente` | incidente_eventos | (incidente_id, creado_at) | Historial del caso |
| `idx_seguidores_agente` | incidente_seguidores | (agente_id) | Vista "Siguiendo" |
| `idx_refresh_tokens_usuario` | refresh_tokens | (usuario_id) | Purga y revocación |
| `idx_auditoria_usuario` | usuarios_auditoria | (usuario_id, creado_at DESC) | Historial por usuario |
| `idx_auditoria_actor` | usuarios_auditoria | (actor_id, creado_at DESC) | "Qué hice yo" |
| `idx_auditoria_fecha` | usuarios_auditoria | (creado_at DESC) | Feed global |

---

## 4. Triggers (2)

### `trg_incidentes_touch` — `actualizado_at` automático
```sql
CREATE TRIGGER trg_incidentes_touch BEFORE UPDATE ON incidentes
FOR EACH ROW EXECUTE FUNCTION touch_actualizado_at();
```
La app nunca escribe `actualizado_at` a mano: no puede quedar desincronizado.

### `trg_incidentes_agente` — integridad del asignado
```sql
CREATE TRIGGER trg_incidentes_agente BEFORE INSERT OR UPDATE OF asignado_a ON incidentes
FOR EACH ROW EXECUTE FUNCTION chequear_agente_asignado();
```
Si `asignado_a` no es `NULL` y ese usuario no tiene rol `agente` o `admin`, la base **rechaza** la operación (SQLSTATE 23514). Es defensa en profundidad: la app ya valida que el destino sea un agente, pero la base no confía en la app.

---

## 5. Rutinas SQL

| Routine | Tipo | Qué hace |
|---|---|---|
| `touch_actualizado_at()` | trigger fn | Mantiene `actualizado_at` |
| `chequear_agente_asignado()` | trigger fn | Valida el rol del asignado |
| `crear_respuesta(p_incidente, p_autor, p_mensaje)` | function | **Transaccional**: valida el mensaje, valida que el incidente exista, inserta la respuesta y pasa el caso a `EnGestion`. Devuelve el id. Errores: 22001 (mensaje inválido), P0002 (no existe) |
| `resumen_cola()` | function STABLE | Conteos por (estado, prioridad) para el panel del agente |
| `upsert_usuario(nombre, email, hash, rol)` | function | Alta idempotente (por email) |
| `upsert_reserva(...)` | function | Alta idempotente (por código) |
| `upsert_incidente(...)` | function | Alta idempotente (por usuario + título) |
| `upsert_respuesta(...)` | function | Alta idempotente (por incidente + autor + mensaje) |
| `sembrar_demo()` | **PROCEDURE** | Seed completo: 2 admins + 4 agentes + 6 viajeros + 10 reservas + 14 incidentes + 7 respuestas + asignaciones + seguimientos + eventos |

`crear_respuesta()` es la pieza clave del hilo: la respuesta y el cambio de estado a "En gestión" ocurren **o pasan los dos o ninguno** (una transacción de la función SQL).

---

## 6. Migraciones

| Archivo | Qué sube | Cuándo |
|---|---|---|
| `db/schema.sql` | schema v4 completo (fuente única) | Base nueva |
| `db/migrate_02_prioridad_nullable.sql` | `prioridad` a NULL (entra sin triage) | Bases v2 |
| `db/migrate_03_gestion_casos.sql` | `asignado_a`, `incidente_eventos`, `incidente_seguidores` | Bases v2 |
| `db/migrate_04_refresh_tokens.sql` | tabla `refresh_tokens` + índices | Bases v3 |
| `db/migrate_05_admin_auditoria.sql` | rol `admin`, columna `activo`, `usuarios_auditoria`, índices, trigger del asignado | Bases v3 |
| `db/migrate_06_seed_demo_grande.sql` | datos de demostración (`\ir seed_demo.sql` + `CALL`) | Bases v3/v4 |

**Todas son idempotentes**: `IF NOT EXISTS`, `DROP … IF EXISTS` y helpers `upsert_*`. Se pueden correr las veces que haga falta sin romper nada.

> `db/schema.sql` es **destructivo** (empieza con `DROP TABLE … CASCADE`): nunca lo apliques sobre una base con datos sin `-Force`.

Cómo se aplican:
```powershell
# base nueva
psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql

# base existente (Railway): solo seeds + migraciones, sin tocar el schema
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 -DatabaseUrl "<url del túnel>"
```

---

## 7. Seed de demostración

`sembrar_demo()` (en `db/seed_demo.sql`, invocado por `db/seeds.sql`):

| Grupo | Detalle |
|---|---|
| 2 admins | `admin@despegar.com` / `Admin1234`, `admin2@despegar.com` / `Admin5678` |
| 4 agentes | `agente@`, `maria@`, `carlos@`, `lucia@` (`@despegar.com`) |
| 6 viajeros | `ana@`, `bruno@`, `sofia@`, `diego@`, `valeria@`, `tomas@` (`@test.com`) |
| 10 reservas | 6 vuelos + 4 hoteles, repartidos entre los viajeros |
| 14 incidentes | Los 7 tipos, en todos los estados y prioridades |
| 7 respuestas | Hilos armados en los casos ya atendidos |
| Casos especiales | 2 **sin triage**, 4 con **SLA vencido**, casos asignados a los 4 agentes, 2 seguidos por `lucia@` |

Es idempotente: correrlo de nuevo no duplica nada (los `upsert_*` buscan por email/código/usuario+título).

---

## 8. Decisiones de modelado (y por qué)

| Decisión | Alternativa | Motivo |
|---|---|---|
| `prioridad` NULL al crear | `'Baja'` por defecto | Un caso sin triage es visible en la cola del agente; si naciera "Baja" parecería atendible |
| `prioridad_sugerida` aparte de `prioridad` | Solo `prioridad` | La sugerencia del sistema **no** es la decisión del agente: son dos datos distintos |
| `sla_vence_at` como timestamp | `sla_horas` + `triado_at` | El deadline se calcula una vez al triar; si el caso se re-trea, se recalcula |
| Trigger para el SLA | Solo la app | La base no depende de que la app se comporte bien |
| Trigger para el rol del asignado | Solo la app | Igual: integridad en la base |
| `usuarios_auditoria` con valores anterior/nuevo | Solo "qué pasó" | Con el valor anterior y el nuevo se puede reconstruir qué cambió sin diffs |
| `TIMESTAMPTZ` | `TIMESTAMP` | Con zona horaria; las fechas se guardan en UTC y se muestran en `es-AR` |
| `IDENTITY` | `SERIAL` | Sintaxis estándar de PG 10+ |
| Sin `JSONB` | Columnas tipadas | Todo se consulta por índice; el JSONB no aporta nada acá |
| Sin tabla de auditoría genérica | `usuarios_auditoria` a medida | Un log genérico de cambios es más difícil de consultar; esta tabla responde las preguntas reales |

---

## 9. Puntos débiles del modelo (para ser honesto)

- **Sin particionado ni retención**: `incidente_eventos` y `usuarios_auditoria` crecen sin límite. Con volumen real habría que particionar por mes o archivar.
- **Sin `updated_at` en `respuestas` ni en `usuarios_auditoria`**: no se puede saber si algo fue editado (hoy nada se edita, pero es una deuda).
- **El borrado en cascada es agresivo**: si se borra un usuario, se van sus incidentes, respuestas e historial. Hoy no hay borrado de usuarios (solo desactivación), pero conviene tenerlo presente.
- **La sugerencia de prioridad son reglas, no un modelo**: no aprende de la resolución real del agente. Es una decisión consciente (sin dependencias, sin IA opaca).

---

# 05-apps.md

# 05 — Las apps móviles

Dos apps Expo (mismo código, roles distintos) que comparten una capa `apps/shared/`.

| | Viajero | Agente (+ admin) |
|---|---|---|
| Paquete | `com.despegar.viajero` | `com.despegar.agente` |
| Slug EAS | `@ynnxx23/despegar-viajero` | `@ynnxx23/despegar-agente` |
| Puerto Metro | 8081 | 8082 |
| Login | público (registro de viajeros) | solo admins/agentes (sin registro) |
| Pantallas | 7 | 4 (+ 2 paneles) |

---

## 1. Capa compartida (`apps/shared/`)

El requisito del enunciado era "componentes reutilizables" y "código compartido único". Acá está todo lo que las dos apps usan:

| Módulo | Responsabilidad |
|---|---|
| `api.js` | Cliente HTTP: Bearer automático, timeout de 8 s, refresh del token, reintento único, mensajes de error legibles, aviso si la URL no sirve desde el celu |
| `auth.js` | Sesión persistente: `expo-secure-store` (keychain) con **adaptador de memoria** para poder testearlo en Node |
| `session.js` | Hook `useSession()`: arranque de sesión, cierre, y la regla "un error de red **no** destruye la sesión" |
| `hooks.js` | `useApiList()`: carga + refresco + error + estado de carga para listas |
| `components.js` | `AppButton`, `AppInput`, `Badge`, `Chip`, `ErrorBanner`, `EmptyState`, `LoadingRow`, `ApiWarning`, `FormScrollView` |
| `theme.js` | Tokens de diseño (colores, spacing, radius, tipografía, targets táctiles) |
| `format.js` | Etiquetas legibles (tipos, estados, prioridades, roles) y fechas en `es-AR` |
| `LoginScreen.js` | Login parametrizable por rol (el de la app agente es un wrapper de 20 líneas) |

**Monorepo sin workspaces:** no hay `package.json` raíz. Cada app tiene sus `node_modules` y su `metro.config.js` con:

```js
config.watchFolders = [workspaceRoot];                    // ve ../shared
config.resolver.nodeModulesPaths = [path.resolve(projectRoot,'node_modules')];
```

Así las dos apps pueden usar **versiones distintas** de una dependencia sin romper nada, y Metro no sube `node_modules` de la otra app.

---

## 2. Sesión (`apps/shared/session.js`)

```js
const session = useSession({ roles: ['viajero'] });
// → { estado: 'cargando'|'login'|'app', user, sinConexion, login, logout, reintentar }
```

Flujo de arranque:

```
1. Leo el token y el usuario de SecureStore
2. Si no hay token            → estado 'login'
3. Pongo el token en memoria y llamo GET /api/me
   ├─ 200 + rol permitido     → estado 'app'
   ├─ 200 + rol no permitido  → cierro sesión (no sirve de nada)
   ├─ 401                     → cierro sesión (el token no sirve más)
   └─ cualquier otro error    → CONSERVO la sesión y marco sinConexion = true
```

El último punto es el que arreglamos: antes, **cualquier** fallo de `api.me()` (timeout, sin red, 500) borraba la sesión del usuario y lo obligaba a loguearse de nuevo, dejando además un refresh token vivo 30 días en el servidor. Ahora la sesión se conserva y la app avisa "Sin conexión con el servidor" con un botón de reintento.

**Cierre de sesión:** se revoca el refresh token en el servidor (`POST /api/logout`), se borra SecureStore y se limpia el token en memoria. La app nunca guarda el token en AsyncStorage plano.

**401 durante el uso:** `api.js` intenta el refresh una sola vez (`reintentar: false` en el reintento) y, si falla, dispara `onUnauthorized` → la app cierra sesión sola.

---

## 3. Cliente HTTP (`apps/shared/api.js`)

```js
const TIMEOUT_MS = 8000;
const controller = new AbortController();
setTimeout(() => controller.abort(), TIMEOUT_MS);   // sin esto el fetch queda colgado
```

- **Timeout de 8 s**: sin `AbortController`, un paquete descartado deja la UI en "Conectando…" para siempre. Es un bug clásico de React Native.
- **Refresh compartido**: si 5 requests reciben 401 a la vez, los 5 esperan **la misma** promesa de refresh (`refrescoEnCurso`) y reintentan con el token nuevo. No se emiten 5 refresh ni se invalidan entre sí.
- **Errores legibles**: el backend devuelve `{error:{code,message,details}}`; si la respuesta no es JSON (502 de un proxy), se mapea el status a un mensaje entendible ("El servidor tiene un problema. Probá en un momento.").
- **`err.details`** queda disponible para el detalle de validación.
- **Aviso de URL**: `API_WARNING` avisa si falta `EXPO_PUBLIC_API_URL` (la app apuntaría a `localhost`, que no sirve desde el celu) y también si la URL es `http://` contra un host que no es local (el token viajaría sin cifrar).

---

## 4. Pantallas

### App Viajero (`apps/viajero/`)
| Pantalla | Qué hace |
|---|---|
| `LoginScreen` | Wrapper del login compartido (rol `viajero`, con link a registro) |
| `RegisterScreen` | Alta de viajero con **la misma validación que el backend** (nombre 2-100, email válido ≤160, password 8-72) y contadores de caracteres |
| `ItinerarioScreen` | Vuelos y hoteles del usuario, con el próximo viaje destacado, pull-to-refresh y días restantes |
| `NuevoIncidenteScreen` | Tipo (7, con chips), reserva opcional, título y descripción con contador, confirmación antes de enviar, y **el borrador no se pierde** al cambiar de pestaña |
| `MisIncidentesScreen` | Lista de sus casos con filtros por estado y contadores, y la prioridad **sugerida** (la real no se le muestra) |
| `DetalleIncidenteScreen` | Detalle + timeline de 3 pasos (con texto, no solo color) + hilo de respuestas en `FlatList` |
| `AyudaScreen` | FAQ + estado del servicio |
| `PerfilScreen` | Datos de la cuenta, rol, cierre de sesión con confirmación |

### App Agente (`apps/agente/`)
| Pantalla | Qué hace |
|---|---|
| `LoginScreen` | Wrapper del login compartido con `roles={['agente','admin']}` |
| `ColaScreen` | Pestañas **Activos / Sin triar / Míos / Siguiendo / Resueltos**, 3 chips con conteos **globales**, filtros (tipo, prioridad), orden (urgencia/antiguos/recientes), paginación, reclamar y seguir |
| `DetalleGestionScreen` | Caso: reclamo, liberación, derivación (con motivo), triaje, respuesta, cierre, reapertura (con motivo) e historial |
| `AdminUsuariosScreen` | **Solo admin**: lista con búsqueda y filtro por rol, alta de usuario, cambio de rol, activar/desactivar, reset de contraseña, historial de cambios |
| `components/panelesGestion.js` | 5 paneles de la gestión (`ResumenCaso`, `PanelAccion`, `PanelViajero`, `PanelTriaje`, `PanelRespuesta`, `PanelHistorial`) |
| `components/estilosGestion.js` | Hoja de estilos compartida por la pantalla y los paneles |

**La cola no reordena ni re-cuenta en el cliente.** Todo filtro y todo orden van al servidor (`?estado=activos&prioridad=sin_triar&tipo=…&orden=urgencia&page=…`), y los conteos de los chips salen de `GET /api/admin/incidentes/resumen` (global), no de la página que estás viendo. Antes la app filtraba en memoria: la paginación mostraba páginas vacías y los contadores mentían.

**La pestaña "Administrar" solo existe si `user.rol === 'admin'`.** No es que se oculte visualmente: el rol llega del token y además la API revalida el rol contra la base en cada request, así que un admin degradado pierde el panel (403) en la llamada siguiente.

---

## 5. Navegación

**Sin React Navigation.** Elegimos pestañasBottom / stack propias con `View` + `Pressable` + estado de React. Motivo: menos dependencias (el enunciado pide evitar dependencias innecesarias) y control total del comportamiento de "pestañas montadas que no se desmontan".

Truco de la app viajero: las pestañas se **montan la primera vez que se abren y nunca se desmontan** (las inactivas se ocultan con `display: 'none'`). Así el borrador del reporte sobrevive al cambio de pestaña; el formulario solo se reinicia después de un envío exitoso.

---

## 6. Accesibilidad (y diseño)

- **Contraste AA**: los colores de texto sobre fondo cumplen ≥4.5:1. Los originales (`#F59E0B` ámbar, `#16A34A` verde, `#FF6B35` naranja) **no** cumplían (2.15:1, 3.30:1, 2.84:1) y se reemplazaron por variantes oscuras (`#B45309`, `#15803D`, `#C2410C`). El texto de error usa `#B91C1C` sobre `#FDECEC` (5.6:1).
- **Targets táctiles**: mínimo 44-48 dp (`theme.touch = 48`). Los "reintentar" que eran `Text` con `onPress` (16 dp de alto) ahora son botones de 44 dp.
- **No depender solo del color**: cada badge lleva **texto**; el timeline dice "Completado / En curso / Pendiente"; los chips de tipo announce `accessibilityState={{selected:true}}`; los inputs tienen `accessibilityLabel`.
- **Errores anunciados**: `ErrorBanner` con `accessibilityRole="alert"` y `accessibilityLiveRegion="polite"`.
- **Cargando**: `accessibilityRole="progressbar"` + `accessibilityState={{busy:true}}`.
- **Teclado**: `FormScrollView` mide la altura del teclado y scrollea al input enfocado. En iOS el padding lo aplica `KeyboardAvoidingView` (en Android el padding) → **nunca se cuenta dos veces** (era un bug: el formulario saltaba de más).

---

## 7. Build y distribución

### Desarrollo (Expo Go)
```
start-viajero.cmd     # doble clic: npm install + expo start (puerto 8081)
start-agente.cmd      # puerto 8082
```
El `.cmd` escribe `EXPO_PUBLIC_API_URL` en `apps/<app>/.env` leyendo `deploy/api-url.txt` (Railway) o detectando la IP LAN (modo `local`).

> La URL **va incrustada en el bundle** en tiempo de build: si cambia, hay que reiniciar Expo (recargar la app no alcanza).

### Distribución (APK standalone)
```
cd apps/viajero
eas build --profile preview --platform android
```
- EAS compila en la nube (no hace falta Android SDK ni Java en la PC).
- `eas.json` define los perfiles: `development` (dev client), `preview` (APK instalable a mano) y `production` (AAB para Play Store).
- Los perfiles `preview`/`production` fijan `EXPO_PUBLIC_API_URL` a la URL de Railway → la app instalada nunca apunta a `localhost`.
- El APK lleva el bundle JS adentro: **no necesita Metro ni la PC**.

### Instalar en el celu
Escanear el QR del build → "Instalar apps de orígenes desconocidos" → instalar. Para iPhone, EAS genera un IPA, pero instalarlo en un dispositivo real requiere una Mac con cuenta de Apple Developer.

### Actualizar
Un build nuevo se instala **encima** del anterior (mismo paquete y misma firma, que EAS mantiene por proyecto) y **conserva la sesión** (el token sigue en SecureStore).

---

## 8. Limitaciones conocidas de las apps

- **Sin tests de componentes**: la lógica de las apps solo se cubre de forma indirecta (el bundle compila y hay un test del cliente HTTP). Lo primero que agregaría es un test del hook `useSession` con el mismo patrón que `api_client_refresh.test.mjs`.
- **Sin notificaciones push**: el usuario tiene que abrir la app para ver cambios. (Había un módulo de notificaciones en la copia del repo, pero no estaba integrado al router ni tenía tests: se eliminó por alcance.)
- **Sin modo offline real**: si no hay red, la app avisa, pero no encola acciones.
- **Sin internacionalización**: los textos están en español, hardcodeados.

---

# 06-api.md

# 06 — Referencia de la API

Base: `/api` (alias `/api/v1` idéntico) · JSON · `Authorization: Bearer <jwt>`.
Producción: `https://api-production-88975.up.railway.app/api`.
Especificación formal: `docs/openapi.yaml` (OpenAPI 3.0.3, 30 operaciones).

Convenciones:
- Éxito: `200` (o `201` al crear) con `{ "data": ... }` — las rutas de auth devuelven `{user, token, refresh_token}`.
- Error: `{ "error": { "code": <http>, "message": "…", "details": {…}? } }`.
- Todos los `id` son numéricos en el JSON (PostgreSQL los devuelve como texto; el backend los normaliza).

---

## 1. Salud

### `GET /health` — público
```json
{ "ok": true, "service": "despegar-api", "version": "v1", "roles": ["viajero","agente","admin"] }
```
Responde **sin tocar la base**: si PostgreSQL está caído, el health sigueOk (sirve para el healthcheck de Railway).

---

## 2. Autenticación (público)

### `POST /register` — público
Body: `{nombre, email, password}` (nombre 2-100, email válido ≤160, password 8-72).
→ `201` `{user, token, refresh_token}`. El rol es **siempre `viajero`**.
Errores: `400` validación · `409` email duplicado · `429` cuota de altas.

### `POST /login` — público
Body: `{email, password}` → `200` `{user, token, refresh_token}`.
Errores: `400` faltan campos · `401` credenciales (mensaje genérico: no revela si el email existe) · `403` cuenta desactivada · `429` cuota (por IP y por cuenta).

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
Cada caso viene en **proyección pública**: sin `prioridad` real, sin `triado_por`, sin `sla_vence_at`, sin `asignado_a`; sí con `prioridad_sugerida` y `prioridad_motivo`.

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
  (historial **público**: solo claim, respuesta, estado, resuelto y reabierto; sin motivos internos).
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

→ `200` `{data:[...], total, page, limit}`. Cada caso trae `asignado_a`, `asignado_nombre`, `siguiendo` (¿lo sigo yo?) y `seguidores_count`.

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

### `PUT /api/admin/incidentes/{id}` — `agente|admin`
Body: `{prioridad?, estado?, motivo?}`.
- Prioridad → **triaje**: fija `triado_por`, `triado_at` y `sla_vence_at` (Crítica 4 h, Alta 24 h, Baja 72 h). El SLA **solo** se recalcula si la prioridad cambia.
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
Body: `{mensaje}` (2-2000). Inserción atómica vía `crear_respuesta()`: la respuesta se guarda y el caso pasa a `EnGestion` en la misma transacción.
→ `201` `{data:{id,incidente_id,mensaje,autor,autor_rol,creado_at}}`.

### `GET /admin/incidentes/{id}/historial` — `agente|admin`
→ `200` `{data:[{id,accion,detalle,creado_at,actor_id,actor_nombre}]}`.
Acciones: `creado, claim, release, derivar, seguir, dejar_seguir, responder, estado, prioridad, triaje, resuelto, reabierto`.

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
Body: `{nombre, email, password, rol}` → **alta un usuario con el rol que elijas** (agente, viajero o admin). Genera su access token y su refresh token para que pueda entrar enseguida.
→ `201` `{data:{id,nombre,email,rol,activo}}`.
Errores: `400` validación · `409` email duplicado · `401` · `403`.

### `PUT /admin/usuarios/{id}` — `admin`
Body: `{rol?, activo?, password?, motivo?}` — cambios parciales, todos opcionales.
- `rol` → promueve/degrada (queda registrado con valor anterior y nuevo)
- `activo` → activa/desactiva (una cuenta desactivada no puede loguearse ni usar tokens)
- `password` → resetea la contraseña (8-72)
- `motivo` → se guarda en la auditoría

→ `200` `{data:{id,nombre,email,rol,activo}}`.
Errores: `400` valor inválido, o intento de cambiarte el propio rol / desactivar tu cuenta · `409` si la base quedaría sin ningún admin activo · `404` si el usuario no existe.

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

---

# 07-despliegue-y-operacion.md

# 07 — Despliegue y operación

## 1. Panorama

```
Repositorio (GitHub, rama main)
   │
   ├──► CI (GitHub Actions) en cada push: PostgreSQL + API + tests
   │
   ├──► Railway (deploy manual con `railway up`):
   │      ├── servicio "api"      → imagen Docker (php:8.2-cli + pdo_pgsql)
   │      └── servicio "Postgres" → plugin con volumen postgres-volume (500 MB)
   │                                (red privada entre servicios)
   │
   └──► EAS Build (nube de Expo) → APK Android por proyecto
```

---

## 2. Railway

### Servicios

| Servicio | Qué es | Puerto | Coste |
|---|---|---|---|
| `api` | Contenedor con el `Dockerfile` de la raíz | `$PORT` (inyectado) | CPU/RAM mientras corre |
| `Postgres` | Imagen del plugin (`postgres-ssl:18`) + volumen | 5432 (privado) | ~USD 5–20/mes según uso |

La API **no** está en GitHub Actions: el deploy se hace desde la PC con la CLI (`railway up`), porque el proyecto tiene el servicio `api` sin source conectado a GitHub. Por eso los scripts se ejecutan **desde la raíz del repo** (el CLI sube la carpeta respetando `.railwayignore`).

### Variables de entorno del servicio `api`

| Variable | Valor | Notas |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al plugin: red privada, no sale a internet |
| `JWT_SECRET` | 64 hex aleatorios | **Obligatoria**: con menos de 32 caracteres la API arranca con 500 |
| `HEALTHCHECK_ENABLED` | `1` / `0` | `0` = el healthcheck sale sin pegarle un request (permite dormir el servicio) |
| `PORT` | inyectado por Railway | El `Dockerfile` escucha en `${PORT}` |
| `PHP_CLI_SERVER_WORKERS` | 8 (en el `Dockerfile`) | Varios workers del server embebido |

### Volumen

El Postgres usa el volumen `postgres-volume` (500 MB). **Pausar el servicio no borra los datos**: `railway down` apaga el contenedor y el volumen sigue ahí. Reanudar recrea el deployment desde la imagen del plugin y los datos vuelven.

### Prender / apagar (doble clic)

| Script | Qué hace |
|---|---|
| `start-railway.cmd` | Verifica la CLI y el vínculo del proyecto → levanta Postgres (espera `SUCCESS`) → `HEALTHCHECK_ENABLED=1` → `railway up` → espera el health → muestra la URL |
| `stop-railway.cmd` | `HEALTHCHECK_ENABLED=0` → `railway down` en `api` y en `Postgres` → 0 CPU / 0 RAM facturados |

Equivalentes en PowerShell: `deploy\railway-resume.ps1` y `deploy\railway-pause.ps1`.

> **Por qué apagar:** el proyecto es de demostración. Con el servicio corriendo se factura CPU/RAM todo el mes. Los scripts dejan el proyecto en 0 costo fuera de la demo, sin perder datos.

### Aplicar cambios de esquema

```powershell
# 1. Con el proyecto prendido, abrir el túnel (otra terminal)
railway connect Postgres --tunnel-only --port 54320
#    imprime: postgresql://postgres:<PASS>@127.0.0.1:54320/railway

# 2. Aplicar seeds + migraciones (idempotentes)
powershell -ExecutionPolicy Bypass -File deploy\init-db.ps1 `
  -DatabaseUrl "postgresql://postgres:<PASS>@127.0.0.1:54320/railway"
```

`init-db.ps1` detecta si la base tiene tablas:
- **no tiene** → aplica `schema.sql` + `seeds.sql` (base nueva).
- **tiene** → aplica `seeds.sql` + las migraciones `02/03/04/05/06` (upgrade).
- con `-Force` → re-aplica `schema.sql` (**destructivo**: borra las tablas).

---

## 3. Docker

### `Dockerfile` (imagen de producción)

```dockerfile
FROM php:8.2-cli                      # sin Apache: el server embebido alcanza
RUN apt-get install -y libpq-dev && docker-php-ext-install pdo_pgsql
WORKDIR /app
COPY backend/ /app/                   # solo el backend (el .dockerignore filtra el resto)
ENV PORT=8000
ENV PHP_CLI_SERVER_WORKERS=8
HEALTHCHECK …                          # se puede desactivar con HEALTHCHECK_ENABLED=0
CMD ["sh","-c","php -S 0.0.0.0:${PORT:-8000} -t /app/public"]
```

- Imagen mínima: **runtime + `pdo_pgsql`**, sin Composer, sin vendor.
- `.dockerignore` excluye `.git`, `apps/`, `docs/`, `tests/`, `deploy/`, `*.docx`, `*.md`, `db/`, `backend/.env` → el contexto de build es chico.
- `.railwayignore` (lo que sube el CLI) excluye además `docker-compose.yml` y `start-*.cmd`.

### `docker-compose.yml` (stack local completo)

```bash
docker compose up --build
# API      → http://localhost:8000/api/health
# Postgres → localhost:5432
```

- El servicio `api` **usa el `Dockerfile` de la raíz** (`build: .`): el mismo código que corre en Railway.
- `depends_on: postgres (service_healthy)`: la API espera a que la base esté sana.
- En `docker-entrypoint-initdb.d` se montan `db/schema.sql`, `db/seeds.sql` y `db/seed_demo.sql` (el schema lo incluye con `\ir`, y psql resuelve esa ruta relativa al propio script → tiene que estar en el mismo directorio).
- **Ojo:** los scripts de init solo corren la **primera** vez (cuando el volumen `pgdata` está vacío). Para recrear: `docker compose down -v && docker compose up --build`.
- Si tu PostgreSQL local ya usa el 5432, cambiá el mapeo de puertos o paralo.

---

## 4. CI (`.github/workflows/ci.yml`)

Dispara en cada push y en cada PR. Pasos:

1. `actions/checkout`
2. `shivammathur/setup-php` 8.2 con `extensions: pdo_pgsql`
3. `actions/setup-node` 20
4. `php -l` sobre **todos** los `.php` de `backend/`
5. `psql -f db/schema.sql` y `-f db/seeds.sql` contra el Postgres del servicio
6. Se escribe `backend/.env` de prueba (JWT_SECRET hex de 64, valores fijos)
7. Se levanta la API en background (`php -S 127.0.0.1:8000 -t backend/public`)
8. Se espera el health check (30 intentos)
9. `node --test tests/api.test.mjs` (16 checks)
10. `node --test tests/api_client_refresh.test.mjs` (4 checks)
11. Si algo falla, se sube `api.log` y `backend/var/ratelimit` como artefacto

**Sin secrets**: los valores de prueba son fijos y públicos a propósito. La idea es que cualquiera pueda forkear el repo y tenga CI verde sin configurar nada.

---

## 5. EAS Build (distribución móvil)

| Aspecto | Detalle |
|---|---|
| Cuentas | `@ynnxx23/despegar-viajero`, `@ynnxx23/despegar-agente` |
| Perfiles | `development` (dev client), `preview` (APK manual), `production` (AAB) |
| URL de la API | Fijada en `eas.json` por perfil → Railway (nunca localhost) |
| Instalación | QR del build → "orígenes desconocidos" → instalar |
| Actualización | El APK nuevo se instala encima; conserva la sesión |

El proyecto de EAS guarda las credenciales de firma: los builds futuros se firman con la misma clave, así que las actualizaciones funcionan sin desinstalar.

---

## 6. Entorno local (para desarrollo)

```bash
# 1. Base de datos (PostgreSQL local)
createuser -U postgres -d despegar -P
createdb -U postgres -O despegar despegar
psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql

# 2. Secretos
cp backend/.env.example backend/.env      # ajustar DB_PASS y JWT_SECRET (32+ bytes)

# 3. API
php -S 0.0.0.0:8000 -t backend/public    # 0.0.0.0 para que la llegue el celu por LAN

# 4. Apps
start-viajero.cmd                        # o: start-viajero.cmd local (IP LAN)
start-agente.cmd
```

En `.env` conviene subir las cuotas si vas a correr las suites de tests repetidas (registran usuarios): `REGISTER_RATE_LIMIT=500`.

---

## 7. Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `POST /api/login` → 500 `relation "refresh_tokens" does not exist` | falta una migración | `deploy\init-db.ps1` (aplica `migrate_04`) |
| `relation "usuarios" does not exist` | base vacía | `deploy\init-db.ps1` sin `-Force` |
| 404 recién después de un deploy | el edge todavía rutea al deployment viejo | esperar 10-15 s y reintentar |
| La API responde 404 o no responde | está pausada | `start-railway.cmd` |
| JWT 500 en todos los endpoints | `JWT_SECRET` corta o ausente | `railway variable set --service api "JWT_SECRET=<64 hex>"` y redesplegar |
| 429 al loguearse | cuota por IP o por cuenta | esperar un minuto; el `Retry-After` dice cuándo |
| Postgres no llega a `SUCCESS` al reanudar | quedó con 0 réplicas | `railway scale --service Postgres iad=1` (el script ya lo intenta) |
| "Conectando…" infinito en la app | la URL quedó vieja en el bundle | reiniciar Expo (o recompilar el APK) |
| La app instalada no conecta | la API está pausada | `start-railway.cmd` |
| `Local port 54320 is already in use` | quedó un túnel SSH viejo | matar el proceso `ssh` o usar otro puerto |

---

## 8. Copias de seguridad

- **Volumen de Railway**: es la única fuente de datos de producción. `railway down` no lo borra, pero un "delete project" sí.
- **Respaldo manual**:
  ```bash
  pg_dump "$DATABASE_URL" > respaldo_$(date +%F).sql
  ```
- **Restaurar**: `psql "$DATABASE_URL" -f respaldo.sql`
- **Regenerar los datos de demo**: `deploy\init-db.ps1` (idempotente) o `psql -f db/migrate_06_seed_demo_grande.sql`.

---

# 08-testing.md

# 08 — Testing y calidad

**78 checks automatizados** + un checklist manual sobre dispositivo.

| Suite | Archivo | Checks | Corre en | Qué cubre |
|---|---|---|---|---|
| F2 | `tests/api_f2_auth.ps1` | 15 | Windows (PowerShell) | Registro, duplicado, password corta, login ok/mal, SQLi, `/me` con y sin token, token manipulado, no-leak del hash, refresh, logout |
| F3 | `tests/api_f3_dominio.ps1` | 20 | Windows | Itinerario, 403 de agente en itinerario, crear incidente, reserva ajena, tipo inválido, "míos" con aislamiento de datos, detalle (dueño / ajeno / agente), cola, orden, filtros, respuesta, hilo, PUT ok/inválido/viajero, 401 |
| F7 | `tests/api_f7_integracion.ps1` | 3 | Windows | JWT expirado → 401, y el **loop completo** viajero → agente → viajero |
| F8 | `tests/api_f8_gestion.ps1` | 20 | Windows | Sugerencia de prioridad, bump por keyword, claim, atendido visible para el viajero, no-leak de prioridad, claim en conflicto (409), derivar, seguir, release, historial, resolver sin triage (400), triaje con SLA, orden de urgencia, resumen, lista de agentes, dejar de seguir |
| API | `tests/api.test.mjs` | 16 | **Cualquier SO** (Node 20+) | Health + alias `/api/v1`, register 201/409, login 200/401, SQLi 401, `/me` 401/200, token manipulado, refresh de un solo uso, 404, **405 con `Allow`**, 403 del viajero y del agente en los paneles, panel de admin (listar, crear 201, promover, historial), auto-guard del admin, **revalidación del rol contra la base** |
| Cliente | `tests/api_client_refresh.test.mjs` | 4 | Cualquier SO | 401 → refresca y reintenta sin cerrar sesión, refresh inválido → cierra sesión y propaga el error, header `Authorization` en todas las peticiones, aviso de URL no configurada |

---

## 1. Cómo correrlos

```powershell
# Suite portable (la que corre el CI) — necesita la API en :8000
node --test tests/api.test.mjs

# Cliente móvil (sin API)
node --test tests/api_client_refresh.test.mjs

# Suites Windows (requieren la API en :8000)
powershell -ExecutionPolicy Bypass -File tests\api_f2_auth.ps1
powershell -ExecutionPolicy Bypass -File tests\api_f3_dominio.ps1
powershell -ExecutionPolicy Bypass -File tests\api_f7_integracion.ps1
powershell -ExecutionPolicy Bypass -File tests\api_f8_gestion.ps1
```

Variables útiles:
- `API_BASE` → otra API (por defecto `http://127.0.0.1:8000`).
  ```powershell
  $env:API_BASE='https://api-production-88975.up.railway.app/api'
  node --test tests/api.test.mjs
  ```
- F7 usa `php` del PATH para generar un JWT expirado (`tests/mint_expired.php`).

Si la API no está levantada, la suite **falla con el comando exacto** para levantarla (no con un error críptico).

> **Ojo con las cuotas**: cada suite registra usuarios. Si corrés varias seguidas en la misma hora, el límite de altas (30/h por IP) puede frenar las pruebas. En `backend/.env` local subí `REGISTER_RATE_LIMIT=500` para eso.

---

## 2. Qué cubre cada tipo de prueba (y qué no)

### Seguridad
- SQLi en el login → 401 sin bypass.
- El hash de la contraseña nunca aparece en ninguna respuesta.
- Token manipulado / expirado → 401.
- El refresh token **no se puede reusar** (rotación de un solo uso).
- Un agente no entra al panel de admin (403) y un viajero tampoco.
- Un admin no puede degradarse ni desactivarse (auto-guard).

### Reglas de negocio
- Resolver sin prioridad → 400.
- Reclamar un caso ya asignado → 409.
- La proyección del viajero no expone `prioridad` real ni el SLA.
- El casoSuggestions del sistema no es la prioridad final (el agente decide).

### Integridad
- Aislamiento de datos: un viajero no ve los casos de otro (403).
- ElSuggestión bump por keyword.
- La revalidación del rol: si degradan a un agente **con su token en la mano**, la siguiente request es 403.

### Lo que NO está cubierto (reconozcalo si preguntan)
- **No hay tests end-to-end sobre el dispositivo**: la UI se valida con el checklist manual.
- **No hay test de concurrencia real**: el claim se cubre con el 409 secuencial; falta una prueba con dos clientes simultáneos.
- **No hay tests de las pantallas** (React): no hay runner de React Native Testing Library en el proyecto.
- **No hay test de la ruta de error 500**: el handler global se verificó a mano.
- **No hay cobertura de código** instrumentada: se reporta "checks", no "%".

---

## 3. Checklist manual en el dispositivo (Expo Go o APK)

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Login de viajero | Entra y ve su itinerario |
| 2 | Pull-to-refresh en "Viajes" | Recarga sin cortarse |
| 3 | Reportar incidente | Pide confirmación, avisa el número, aparece en "Incidentes" |
| 4 | Cambiar de pestaña con el formulario a medio llenar | **El borrador sigue ahí** |
| 5 | Login de agente | Cola con los 3 contadores de arriba |
| 6 | Filtrar por tipo/prioridad y cambiar el orden | La lista se reacomoda y la paginación sigue cuadrando |
| 7 | **Reclamar** un caso | Pide confirmación, pasa a "Lo tenés vos", aparece en **Míos** |
| 8 | **Seguir** un caso | Aparece en **Siguiendo**; "Dejar de seguir" lo saca |
| 9 | Poner prioridad Crítica | El SLA se recalcula a 4 h; re-guardar **no** lo renueva |
| 10 | Resolver sin prioridad | Error claro (400) y el panel de prioridad se resalta |
| 11 | Resolver con prioridad | Pide confirmación y el estado pasa a Resuelto |
| 12 | Responder | La respuesta aparece en el hilo y la ve el viajero |
| 13 | Logout | Confirma, borra la sesión local y revoca el refresh |
| 14 | Reiniciar la app | La sesión sigue activa (SecureStore) |
| 15 | Cortar internet y abrir la app | Avisa "Sin conexión" **sin cerrar la sesión** |
| 16 | Login de admin | Aparece la pestaña **Administrar**; el agente **no** la ve |
| 17 | Registrar un agente nuevo | Se crea y puede loguearse con esa cuenta |
| 18 | Promover a un viajero | Al loguearse, entra como agente |
| 19 | Desactivar una cuenta | No puede loguearse |
| 20 | Ver el historial | Actor, campo, valor anterior → nuevo y motivo |

---

## 4. Calidad del código (medidas objetivables)

| Métrica | Valor |
|---|---|
| Líneas de PHP (backend) | ~90 KB en 24 archivos |
| Dependencias de terceros en el backend | **0** |
| Dependencias de npm en las apps | 4 (expo, expo-secure-store, react, react-native, safe-area-context) |
| Endpoints | 30 operaciones documentadas en OpenAPI |
| Tablas / índices / triggers / rutinas | 8 / 13 / 2 / 9 |
| Endpoints con control de roles | 100 % (solo 5 son públicos: health, register, login, refresh, logout) |
| Consultas SQL sin preparar | 0 (`PDO::prepare` + `ATTR_EMULATE_PREPARES=false`) |
| Tests | 78 automatizados + 20 puntos de checklist manual |
| Commits | Pequenos y lógicos, uno por feature |

---

## 5. Lint y formato

- **PHP**: `php -l` en todos los archivos (lo hace el CI). Sin formatter externo (no hay PHP-CS-Fixer: se mantiene el estilo del proyecto: 2 espacios, PSR-12 suave).
- **JS**: sin ESLint configurado (el proyecto no lo tenía); el chequeo real es que **Metro empaqueta sin errores** (`npx expo export`), que valida imports, sintaxis y que todos los módulos existan.
- **Verificación de imports del `shared`**: script propio que resuelve cada import contra los exports reales de `apps/shared/*` (0 faltantes).

---

# 09-decisiones-y-limitaciones.md

# 09 — Decisiones técnicas, límites y trabajo futuro

## 1. Decisiones (con su porqué y su consecuencia)

### D-01 · Backend en PHP 8.2 sin framework
**Contexto:** el enunciado evalúa POO, PDO y criptografía, y pide evitar dependencias innecesarias.
**Decisión:** front-controller propio + tabla de rutas + Controllers + Models, sin Composer y sin vendor.
**Consecuencia:** cero dependencias (build de 1 imagen con `php:8.2-cli` + `pdo_pgsql`), control total del flujo y de los errores; a cambio, hay que escribir a mano lo que un framework te da (routing, validación, DI, ORM, testing).

### D-02 · JWT HS256 implementado a mano
**Decisión:** `base64url(header).base64url(payload).HMAC-SHA256(secret)`, 47 líneas, `hash_equals` para comparar firmas, rechazo explícito de `alg != HS256`.
**Consecuencia:** se puede explicar el criptograma entero en la defensa y no hay dependencia ni Composer. Riesgo asumido: es código de seguridad escrito a mano (mitigado con tests: token manipulado, expirado, reuso de refresh).

### D-03 · Sin ORM: PDO con consultas preparadas
**Decisión:** `PDO::prepare` + `execute` con parámetros, `ATTR_EMULATE_PREPARES=false`.
**Consecuencia:** SQL explícito y auditable, sin N+1 invisibles ni surprises de tipos; a cambio, el mapeo objeto↔fila es manual (normalizado en `Incidente::norm()`).

### D-04 · Tabla de rutas propia
**Decisión:** `Router` con patrones `{id}`, roles declarativos, 405 real con header `Allow` y alias `/api/v1`.
**Consecuencia:** el control de acceso está en un solo lugar (declararlo en la ruta) y los errores HTTP son correctos; a cambio, no hay route-model binding ni middleware en cadena (el middleware se aplica dentro del router).

### D-05 · El rol se revalida contra la base en cada request
**Contexto:** con el rol dentro del JWT, degradar a un agente tarda hasta 8 h (la vida del token) en tener efecto.
**Decisión:** `Auth::rolVigente()` consulta `usuarios.rol` en cada request.
**Consecuencia:** la revocación es inmediata (requisito del enunciado) al precio de 1 SELECT por request. Es la decisión de seguridad central del proyecto.

### D-06 · Refresh token opaco con rotación de un solo uso
**Decisión:** 32 bytes aleatorios, en la base **solo el SHA-256**, y en cada refresh el anterior queda revocado.
**Consecuencia:** un token robado sirve una sola vez; el logout revoca. Costo: un refresh por sesiónrenew (tráfico chico) y una tabla que hay que purgar (ya se purga en cada login).

### D-07 · Cuotas de peticiones en archivo con `flock`
**Contexto:** el server embebido de PHP corre con `PHP_CLI_SERVER_WORKERS=8`: un contador en memoria contaría por proceso (8× el límite).
**Decisión:** archivo por clave con `flock(LOCK_EX)`, contadores con ventana renovable y limpieza oportunista.
**Consecuencia:** el límite es real y compartido entre workers. A cambio: un sistema de archivos en vez de Redis, y si el disco no es escribible hace *fail-open* (queda logueado).

### D-08 · Integridad en la base, no solo en la app
**Decisión:** triggers para `actualizado_at` y para validar que `asignado_a` sea un agente; `CHECK` en todos los valores cerrados; FK con `CASCADE`/`SET NULL` explícitos.
**Consecuencia:** la base no confía en que la app se comporte bien. Es la respuesta directa a "las reglas de negocio están en un solo lado".

### D-09 · `prioridad` NULL + `prioridad_sugerida` aparte
**Decisión:** el caso entra sin triage; el sistema calcula una *sugerencia* con reglas (tipo + keywords) y la **prioridad real** la pone un agente.
**Consecuencia:** el agente ve lo que hay que atender primero y el viajero recibe una orientación sin que se le prometa nada. Es la diferencia entre "sugerir" y "decidir".

### D-10 · El SLA se renueva solo si cambia la prioridad
**Contexto:** si el SLA se recalculara en cada guardado, un agente podría "refrescar" el reloj de un caso vencido y hacerlo desaparecer del contador.
**Decisión:** `AdminController::actualizar` calcula `$cambiaPrioridad` y lo pasa al modelo; el `UPDATE` solo toca `sla_vence_at` si la prioridad cambió.
**Consecuencia:** el SLA mide el tiempo real de atención.

### D-11 · Claim atómico con `SELECT … FOR UPDATE`
**Decisión:** lock de fila + `UPDATE … WHERE asignado_a IS NULL OR asignado_a = yo` + verificación de `rowCount`, todo en una transacción con el evento en el historial.
**Consecuencia:** dos agentes no pueden tomar el mismo caso; el segundo recibe 409.

### D-12 · Todo cambio de usuario queda auditado
**Decisión:** tabla `usuarios_auditoria` con actor, campo, valor anterior, valor nuevo y motivo.
**Consecuencia:** se puede reconstruir quién cambió qué y por qué (y eso es requisito del encargo). Costo: una escritura extra por cada cambio administrativo.

### D-13 · Proyecciones por rol en el backend
**Decisión:** `Incidente::toPublic()` (viajero) vs `toAgent()` (agente), `Usuario::toSafe()` para todos. La forgetting de campos sensibles no depende de que la app la aplique.
**Consecuencia:** es imposible filtrar un campo por descuido en el front.

### D-14 · Código compartido en `apps/shared/`, monorepo sin workspaces
**Decisión:** una carpeta `shared/` importada por ruta; cada app con su `metro.config.js` (`watchFolders` + `nodeModulesPaths` local).
**Consecuencia:** el login, los componentes, el cliente HTTP, la sesión y el tema están **una sola vez** (requisito del enunciado), y las apps pueden usar versiones distintas de una dependencia. Costo: no hay tooling de monorepo (no hay type-checking cruzado ni tests compartidos automáticos).

### D-15 · Un error de red no destruye la sesión
**Contexto:** antes, cualquier fallo de `api.me()` (incluido un timeout) borraba SecureStore y obligaba a loguearse de nuevo, dejando un refresh token vivo 30 días.
**Decisión:** `useSession` distingue 401 (sesión inválida → cerrar) de cualquier otro error (offline/timeout/500 → conservar la sesión y avisar).
**Consecuencia:** el usuario no pierde su sesión por un problema de red.

### D-16 · Contrato OpenAPI + suite de tests portable
**Decisión:** `docs/openapi.yaml` (OpenAPI 3.0.3, 30 operaciones, verificado 1:1 contra el router) y la suite de API en Node (`node:test`, sin dependencias) en vez de solo PowerShell.
**Consecuencia:** el CI corre en Linux sin instalar nada raro, y el contrato se puede diffear y documentar automáticamente.

### D-17 · Pausar el proyecto en Railway fuera de la demo
**Decisión:** `stop-railway.cmd` / `deploy\railway-pause.ps1` apagan ambos servicios (el healthcheck deja de generar tráfico y `railway down` libera los contenedores).
**Consecuencia:** 0 CPU / 0 RAM facturados fuera de la demo, con los datos intactos en el volumen. Costo: hay que prender la API para cada demo (1-2 min).

### D-18 · Distribución con APK standalone (EAS)
**Decisión:** además del flujo de desarrollo con Expo Go, se compila un APK por proyecto de EAS con la URL de la API incrustada.
**Consecuencia:** la app se puede demostrar en el celu **sin PC, sin Metro y sin la misma Wi-Fi**. Costo: EAS necesita una cuenta (gratis) y el APK hay que recompilarlo cuando cambia el código.

### D-19 · Se eliminó el código de IA/chatbot/adjuntos
**Contexto:** el repo tenía (en otra línea de historia) un chatbot, heurística de IA, OCR, adjuntos, push y notificaciones. Ninguno estaba registrado en el router, sin tests, y con una migración incompatible con nuestro schema.
**Decisión:** borrar ese código y dejar solo lo que el proyecto expone; su documentación histórica quedó fuera del repo (en `.git/info/exclude`).
**Consecuencia:** el repo entregado tiene cero código muerto y el alcance coincide con el borrador.

---

## 2. Límites conocidos (con honestidad)

| Límite | Impacto | Cómo se mitiga hoy |
|---|---|---|
| Sin tests end-to-end en el dispositivo | Un cambio de UI puede romper algo que los tests no ven | Checklist manual de 20 puntos + bundle de Metro validado |
| Sin tests de componentes (React) | La lógica de las pantallas no está automatizada | Solo se cubre el cliente HTTP (4 tests) |
| Sin concurrencia real testeada | El claim se probó de forma secuencial (409) | El lock y el `UPDATE` condicional garantizan la exclusión |
| API síncrona | Con carga alta, un request bloquea un worker | 8 workers; para producción, cola o PHP-FPM |
| Sin observabilidad | Los errores se ven en `error_log` (texto) | Falta logging estructurado + métricas |
| Sin caché | El resumen de la cola hace 4 queries por llamada | Volumen bajo; con carga real, cachear o materializar |
| Sin push notifications | El usuario tiene que abrir la app | Pendiente (había un módulo sin integrar) |
| Sin modo offline | Sin red, la app avisa pero no encola | Pendiente |
| Sin iOS | El APK es Android | EAS genera el IPA, pero instalarlo en un iPhone real requiere Mac + cuenta de Apple |
| Sin versionado real del esquema | Un cliente viejo con un payload viejo no está soportado | Hay alias `/api/v1` y migraciones numeradas |
| Credenciales de demo públicas | Cualquiera puede entrar como admin mientras la API esté prendida | Las cuentas están en `datos.md` y hay que **apagar** la API fuera de la demo |

---

## 3. Trabajo futuro (ordenado por impacto)

1. **Observabilidad**: logging estructurado con `request-id`, métricas de latencia y errores por código, y un health check que realmente chequee de la base.
2. **Tests end-to-end del backend**: subir la suite de Node a 40-50 checks y agregar un test de concurrencia real (dos clientes con el mismo caso).
3. **Tests de la app**: React Native Testing Library para `useSession`, `api.js` y el reducer de la cola.
4. **Pasar a una cola de trabajo** para la parte que hoy es síncrona (reportes con adjuntos/análisis sería el candidato natural).
5. **Push notifications** con el módulo que quedó en la copia del repo, si el alcance lo permite.
6. **iOS**: dejar el `eas.json` listo (ya está) y publicar en TestFlight.
7. **Versionado de esquema**: formalizar `/api/v1` con política de deprecación.
8. **Sugerencia de prioridad** como modelo: aprender de la resolución real del agente en lugar de reglas fijas.

---

## 4. Preguntas de la devolución (con respuesta corta)

**"¿Qué fue lo más difícil?"**

Que el sistema no permitiera hacer trampa. Tres casos concretos: el SLA que se renovaba solo al re-guardar, el claim que dos agentes podían "ganar" al mismo tiempo y el rol que seguía valiendo 8 horas después de degradar una cuenta. Los tres se resolvieron con la misma idea: **la regla se aplica en el servidor y, cuando se puede, en la base de datos** (transacciones, locks, triggers).

**"¿Qué cambiarías de la arquitectura?"**

El backend es síncrono y sin observabilidad: para una carga real, lo primero es logging estructurado y una cola. Y me gustaría haber versionado el esquema desde el principio (hay un alias `/api/v1`, pero no una política de deprecación real).

**"¿Por qué no usaste la IA que había en el repo?"**

Ese código venía de otra línea de trabajo y no estaba integrado: sus endpoints no estaban en el router, sus migraciones no eran compatibles con nuestro schema y no tenía tests. El alcance del grupo es el del borrador (viajero, agente y admin), así que preferimos entregar un sistema completo y probado antes que un alcance más amplio a medio integrar.

**"¿Qué aprendieron como equipo?"**

A leer el código de los otros y a discutir las decisiones con argumento: cada vez que cambió una regla de negocio (SLA, claim, roles) hubo que tocar el backend, la base y las dos apps, y el test que lo cubría. Eso es lo que hace que el proyecto se sostenga.

---

## Fin de la documentación unificada de /yensel
