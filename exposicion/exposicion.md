# Exposición — Sistema Despegar (Grupo 8)

> Documentación para repasar la exposición. Incluye explicación general, partes clave del código (archivo y línea), asignación equitativa entre los 5 integrantes y referencias a telecomunicaciones en cada sección.

---

## 0. Resumen ejecutivo

**Despegar** es una plataforma de gestión de incidentes críticos de viajes con tres roles (`viajero`, `agente`, `admin`). Un viajero reporta un problema desde su celular; un agente lo toma de una cola priorizada por SLA, lo atiende y responde; un administrador da de alta usuarios y agentes.

**Stack:**
- **Backend:** PHP 8.2 puro (POO + PDO), sin framework. Punto de entrada: `backend/public/index.php`.
- **Base de datos:** PostgreSQL 15+, 8 tablas, 13 índices, 2 triggers, 9 rutinas SQL.
- **Apps móviles:** React Native + Expo, dos apps (`viajero` y `agente`) que comparten código en `apps/shared/`.
- **Autenticación:** JWT HS256 (8 h) + refresh token opaco (SHA-256 en BD, rotado en cada uso).
- **Despliegue:** local con `php -S` y opcional en Railway (Docker).

**Comunicación:** Toda la interacción entre cliente y servidor se hace mediante **peticiones HTTP/1.1** sobre **TCP** (puerto 8000 local, puerto 443 en Railway). Los datos viajan en formato **JSON** bajo el estilo arquitectónico **REST**. Cada petición lleva un header `Authorization: Bearer <JWT>` para autenticación.

---

## Contexto corporativo — Despegar (conocimiento general, todos los integrantes)

Despegar es una empresa líder en viajes y turismo en Latinoamérica. El sistema que presentamos simula su canal de soporte para **incidentes críticos de viaje**: problemas que afectan a un viajero en pleno trayecto y requieren atención rápida y organizada.

**Escenario de negocio:**
- Un viajero queda varado (vuelo cancelado, hotel sin reserva) o sufre un cobro indebido.
- Necesita un canal rápido para reportar el problema desde su celular.
- Del lado de la empresa, los casos llegan mezclados y los agentes de soporte necesitan saber cuál atender primero según urgencia (SLA).
- Un administrador gestiona el equipo de soporte: da de alta agentes, cambia roles, desactiva cuentas y audita cambios.

**Los 3 roles del sistema:**
- `viajero`: cliente que reporta incidentes y consulta sus viajes.
- `agente`: soporte que toma casos de la cola, les da prioridad y responde.
- `admin`: gestiona usuarios, agentes y la trazabilidad de cambios.

---

## Defensa del código — puntos que todo expositor debe dominar

### A. Rastro de código (auditoría y trazabilidad)
Todo cambio relevante queda registrado con actor, campo, valor anterior y valor nuevo.

| Qué se audita | Dónde está en el código |
|---|---|
| Cambios de usuarios (rol, activo, password) | `backend/src/Models/Auditoria.php` |
| Tabla de auditoría | `db/schema.sql:130` (tabla `usuarios_auditoria`) |
| Historial de eventos de un caso | `backend/src/Models/GestionCaso.php:64` (`historial`) |
| Historial público del viajero | `backend/src/Models/GestionCaso.php:79` (`historialPublico`) |
| Endpoint de historial | `backend/src/Controllers/AdminUsuariosController.php:172` |

**Respuesta si preguntan:** "Cada acción administrativa queda en la tabla `usuarios_auditoria` con `actor_id`, `campo`, `valor_anterior`, `valor_nuevo` y `detalle`. Así se sabe quién cambió qué, cuándo y por qué."

### B. Diferenciación de roles
Los roles se definen en la base de datos y se revalidan en cada petición.

| Qué controla cada rol | Dónde está en el código |
|---|---|
| `viajero`: solo ve sus propios incidentes y reservas | `backend/src/Controllers/IncidentesController.php:53` (`propio`) |
| `agente`: cola global, claim, responder, triaje | `backend/src/Controllers/AdminController.php` |
| `admin`: alta de usuarios, cambiar rol, activar/desactivar | `backend/src/Controllers/AdminUsuariosController.php` |
| Revalidación de rol en cada request | `backend/src/Middleware/Auth.php:32` (`rolVigente`) |
| CHECK de rol en BD | `db/schema.sql:42` (`CHECK (rol IN (...))`) |

**Respuesta si preguntan:** "El rol no solo viaja en el JWT: la base lo valida con un CHECK y el middleware lo consulta en cada request. Si degradan a un agente, su siguiente petición recibe 403 inmediatamente."

### C. Manejo de errores
El sistema nunca expone traces ni SQL al cliente.

| Tipo de error | Dónde está en el código |
|---|---|
| Excepciones no controladas → 500 genérico | `backend/public/index.php:31-38` |
| Respuesta JSON uniforme de error | `backend/src/Utils/Response.php:10` |
| Errores de validación (400, 401, 403, 404, 409, 429) | Cada controlador usa `Response::error()` |
| JWT inválido/expirado → 401 | `backend/src/Middleware/Auth.php:22` |
| SQL injection prevenida | `backend/src/Database.php:9` (`ATTR_EMULATE_PREPARES=false`) |

**Respuesta si preguntan:** "Hay un handler global en `index.php` que captura cualquier excepción, la loguea internamente y devuelve un 500 genérico con formato JSON. Nunca sale un trace de PHP ni una consulta SQL al cliente."

---

## Camino de una petición (ruta HTTP)

Toda petición sigue este camino:

```
Cliente (App móvil)
        │
        ▼
  1. HTTP/1.1 sobre TCP (puerto 8000 local / 443 Railway)
  2. Header: Authorization: Bearer <JWT>
  3. backend/public/index.php
     ├─ Security::applyHeaders()          (cabeceras de seguridad)
     ├─ Cors::apply()                     (cabeceras CORS)
     ├─ Database::pdo()                   (conexión a PostgreSQL)
     └─ Router::dispatch()
           ├─ Busca la ruta que matchea
           ├─ Si el método no coincide → 405 + header Allow
           ├─ Auth::requireRole()         (valida JWT + rol en BD)
           └─ Llama al Controlador
        │
        ▼
  4. Controlador valida datos y llama al Modelo
  5. Modelo ejecuta SQL preparado (PDO)
  6. PostgreSQL responde
  7. Controlador responde JSON: {data} o {error:{code,message}}
  8. Regresa al cliente por el mismo canal TCP
```

**Puntos de telecomunicaciones en el camino:**
- Capa de transporte: **TCP** (tanto cliente-servidor como servidor-base de datos).
- Capa de aplicación: **HTTP/1.1** con estilo **REST**.
- Formato de datos: **JSON**.
- Seguridad en tránsito: **HTTPS** (TLS sobre TCP) en producción.
- Autenticación: header `Authorization: Bearer <JWT>` en cada petición.

---

## 1. Tabla de asignaciones (equitativa, 5 personas)

| Integrante | Tema principal | Materia asociada | Partes del sistema |
|---|---|---|---|
| **Yensel** | App del Viajero | Proyecto de desarrollo de apps móviles | `apps/viajero/`, `apps/shared/` (api, auth, session, componentes), navegación, accesibilidad |
| **Mauro** | App del Agente | Proyecto de desarrollo de apps móviles | `apps/agente/`, componentes de gestión, paneles, estilos, cola, detalle de caso |
| **Mateo** | Backend | Laboratorio de programación | `backend/public/index.php`, `backend/src/` (Controladores, Models, Utils, Middleware, autoload) |
| **Melisa** | Base de datos | Bases de datos | `db/schema.sql`, `db/seed_demo.sql`, `db/seeds.sql`, `db/migrate_0*.sql`, tablas, triggers, funciones |
| **Mara** | Despliegue, testing y documentación | Laboratorio de programación / Telecomunicaciones | `deploy/`, `tests/`, `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`, `start-*.cmd`, endpoints públicos |

Cada sección incluye: qué hace, partes clave del código (archivo y línea), y su relación con **telecomunicaciones**.

---

## 2. Yensel — App del Viajero

**Responsabilidad:** Desarrollo de la aplicación móvil del viajero y la capa compartida entre ambas apps.

**Materia:** Proyecto de desarrollo de aplicaciones para dispositivos móviles.

**Partes clave del código:**

| Qué hace | Archivo y línea |
|---|---|
| Pantallas del viajero: login, registro, itinerario, reportar incidente, mis incidentes, detalle, ayuda, perfil | `apps/viajero/` (todas las pantallas) |
| Cliente HTTP con Bearer automático, timeout de 8 s, refresh de token, reintento único | `apps/shared/api.js` (líneas 79-96) |
| Sesión persistente en SecureStore (keychain del celular) con adaptador de memoria para tests | `apps/shared/auth.js` |
| Hook `useSession()`: arranque de sesión, cierre, regla "un error de red no destruye la sesión" | `apps/shared/session.js` |
| Componentes reutilizables: Button, Input, Badge, Chip, Banner, FormScrollView, ApiWarning | `apps/shared/components.js` |
| Tokens de diseño (colores, spacing, radius, tipografía, targets táctiles 48 dp) | `apps/shared/theme.js` |
| Etiquetas legibles y fechas en formato `es-AR` | `apps/shared/format.js` |
| Login parametrizable por rol (viajero usa rol `viajero`) | `apps/shared/LoginScreen.js` |
| Configuración de Metro para compartir código vía `../shared/` | `apps/viajero/metro.config.js` |

**Telecomunicaciones en esta sección:**
- La app realiza **peticiones HTTP GET** a `/api/itinerario` y `/api/incidentes/mios` para obtener datos del servidor.
- Usa **peticiones HTTP POST** a `/api/incidentes` para enviar reportes de incidentes.
- Toda la comunicación va sobre **TCP** (puerto 8000 en desarrollo, puerto 443 en Railway) mediante **HTTPS**.
- Los datos viajan serializados en **JSON**.
- El cliente implementa un **timeout de 8 segundos** por petición para evitar que el fetch quede colgado si un paquete se descarta en la red.
- Implementa **refresh token automático**: si una petición recibe `401`, el cliente renueva el sesión con `POST /api/refresh` y reintenta la petición original una sola vez.
- Los tokens de sesión viajan en el header `Authorization: Bearer <JWT>` de cada petición HTTP.

---

## 3. Mauro — App del Agente

**Responsabilidad:** Desarrollo de la aplicación móvil del agente y sus componentes de gestión de casos.

**Materia:** Proyecto de desarrollo de aplicaciones para dispositivos móviles.

**Partes clave del código:**

| Qué hace | Archivo y línea |
|---|---|
| Pantallas del agente: login, cola, detalle de gestión, administración de usuarios | `apps/agente/` (todas las pantallas) |
| Panel de cola con pestañas Activos / Sin triar / Míos / Siguiendo / Resueltos y conteos globales | `apps/agente/ColaScreen.js` |
| Detalle de gestión: reclamo, liberación, derivación, triaje, respuesta, cierre, reapertura, historial | `apps/agente/DetalleGestionScreen.js` |
| Pantalla de administración de usuarios (solo rol admin): lista, alta, cambio de rol, activar/desactivar, historial | `apps/agente/AdminUsuariosScreen.js` |
| Paneles de gestión compartidos por la pantalla | `apps/agente/components/panelesGestion.js` |
| Estilos compartidos por la pantalla de gestión y los paneles | `apps/agente/components/estilosGestion.js` |
| Configuración de Metro para la app agente | `apps/agente/metro.config.js` |

**Telecomunicaciones en esta sección:**
- La app realiza **peticiones HTTP GET** a `/api/admin/incidentes` para obtener la cola de casos, con filtros por estado, prioridad y tipo.
- Usa **peticiones HTTP PUT** a `/api/admin/incidentes/{id}` para actualizar triaje (prioridad y estado).
- Usa **peticiones HTTP POST** a `/api/admin/incidentes/{id}/claim`, `/release`, `/derivar`, `/seguir` para gestionar la asignación de casos.
- Todas las peticiones van sobre **TCP** mediante **HTTPS**, con header `Authorization: Bearer <JWT>`.
- Los conteos de los chips de la cola (Sin triar, Vencidos, Míos) se obtienen del servidor mediante `GET /api/admin/incidentes/resumen`, no se calculan en el cliente.
- La navegación entre pantallas se maneja internamente en React Native sin recargar la página, pero cada cambio de contexto que requiere datos genera una nueva petición HTTP.

---

## 4. Mateo — Backend (Laboratorio de programación)

**Responsabilidad:** Desarrollo del backend en PHP, autoload, router, controladores, modelos, middlewares y utilidades de seguridad.

**Materia:** Laboratorio de programación.

**Partes clave del código:**

| Qué hace | Archivo y línea |
|---|---|
| Front-controller único: tabla de rutas, CORS, JWT, conexión a BD, despacho a controladores | `backend/public/index.php` |
| Autoload simple que elimina require_once manuales | `backend/src/bootstrap.php` (líneas 5-20) |
| Tabla de rutas con parámetros `{id}`, roles declarativos, 405 real, versionado `/api/v1` | `backend/src/Utils/Router.php` |
| Middleware auth: extrae Bearer JWT, valida firma+exp, revalida rol contra BD | `backend/src/Middleware/Auth.php` |
| JWT HS256 manual (47 líneas, sin dependencias): encode/decode con HMAC-SHA256 y hash_equals | `backend/src/Utils/JwtHS256.php` |
| Respuesta JSON uniforme `{data}` / `{error:{code,message}}` | `backend/src/Utils/Response.php` |
| Headers de seguridad (nosniff, DENY, CSP, HSTS) | `backend/src/Utils/Security.php` |
| CORS configurable por entorno | `backend/src/Utils/Cors.php` |
| Rate limiting por IP y cuenta con archivo + flock | `backend/src/Utils/RateLimit.php` |
| Controlador de autenticación: register, login, refresh, logout, me | `backend/src/Controllers/AuthController.php` |
| Controlador de itinerario del viajero | `backend/src/Controllers/ItinerarioController.php` |
| Controlador de incidentes del viajero: mios, crear, ver, respuestas | `backend/src/Controllers/IncidentesController.php` |
| Controlador de panel de agente: cola, miCola, ver, actualizar, responder, resumen, claim, release, derivar, seguir, historial, agentes | `backend/src/Controllers/AdminController.php` |
| Controlador de administración de usuarios (solo admin) | `backend/src/Controllers/AdminUsuariosController.php` |
| Modelo Usuario: búsqueda, creación, hash BCRYPT, proyección segura | `backend/src/Models/Usuario.php` |
| Modelo Incidente: sugerencia de prioridad, SLA, cola, proyecciones pública/agente | `backend/src/Models/Incidente.php` |
| Modelo GestionCaso: asignado, seguidores, eventos, historial | `backend/src/Models/GestionCaso.php` |
| Modelo Respuesta: lista de hilo, inserción atómica vía función SQL | `backend/src/Models/Respuesta.php` |
| Modelo RefreshToken: emisión, rotación, revocación, purga | `backend/src/Models/RefreshToken.php` |
| Modelo Auditoria: historial de cambios de usuarios | `backend/src/Models/Auditoria.php` |
| Modelo Reserva: itinerario del viajero | `backend/src/Models/Reserva.php` |
| Configuración de variables de entorno | `backend/src/Config.php` |
| Conexión PDO singleton a PostgreSQL | `backend/src/Database.php` |

**Telecomunicaciones en esta sección:**
- El backend expone una **API REST** que escucha peticiones **HTTP/1.1** sobre **TCP**.
- Métodos HTTP utilizados: `GET` (lectura), `POST` (creación), `PUT` (actualización), `DELETE` (eliminar), `OPTIONS` (preflight CORS).
- Códigos de estado HTTP: `200` (OK), `201` (creado), `204` (sin contenido), `400` (error de cliente), `401` (no autorizado), `403` (prohibido), `404` (no encontrado), `405` (método no permitido con header `Allow`), `409` (conflicto), `429` (demasiadas peticiones), `500` (error interno).
- El header `Content-Type: application/json` se usa en todas las respuestas.
- La autenticación viaja en el header `Authorization: Bearer <JWT>`.
- CORS se configura mediante headers `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`.
- El rate limiting usa un archivo con `flock` para ser atómico entre los 8 workers del servidor embebido de PHP.

---

## 5. Melisa — Base de Datos

**Responsabilidad:** Diseño e implementación de la base de datos PostgreSQL, tablas, índices, triggers, funciones y procedimientos almacenados.

**Materia:** Bases de datos.

**Partes clave del código:**

| Qué hace | Archivo y línea |
|---|---|
| Schema v4 completo: 8 tablas, 13 índices, 2 triggers, 8 funciones, 1 procedimiento | `db/schema.sql` |
| Tabla `usuarios` | `db/schema.sql:37` |
| Tabla `reservas` | `db/schema.sql:47` |
| Tabla `incidentes` | `db/schema.sql:63` |
| Tabla `respuestas` | `db/schema.sql:90` |
| Tabla `incidente_eventos` | `db/schema.sql:99` |
| Tabla `incidente_seguidores` | `db/schema.sql:109` |
| Tabla `refresh_tokens` | `db/schema.sql:118` |
| Tabla `usuarios_auditoria` | `db/schema.sql:130` |
| Función trigger `touch_actualizado_at()` (mantiene `actualizado_at`) | `db/schema.sql:146` |
| Trigger `trg_incidentes_touch` (BEFORE UPDATE) | `db/schema.sql:152` |
| Función trigger `chequear_agente_asignado()` (valida rol del asignado) | `db/schema.sql:157` |
| Trigger `trg_incidentes_agente` (BEFORE INSERT/UPDATE) | `db/schema.sql:167` |
| Función `crear_respuesta()` (inserta respuesta + pasa a EnGestion atómicamente) | `db/schema.sql:173` |
| Función `resumen_cola()` (conteos por estado/prioridad) | `db/schema.sql:190` |
| Funciones helpers idempotentes del seed: `upsert_usuario`, `upsert_reserva`, `upsert_incidente`, `upsert_respuesta` | `db/schema.sql:197-259` |
| Procedimiento `sembrar_demo()` (seed idempotente con datos de prueba) | `db/seed_demo.sql:8` |
| Script que invoca el procedimiento de seed | `db/seeds.sql` |
| Migraciones idempotentes para bases con schema anterior | `db/migrate_0*.sql` |
| Índice de cola `idx_incidentes_cola(estado, prioridad, creado_at)` | `db/schema.sql:84` |
| Índice parcial de SLA `idx_incidentes_sla` | `db/schema.sql:87` |

**Telecomunicaciones en esta sección:**
- La aplicación PHP se conecta a PostgreSQL mediante una **conexión TCP/IP** en el puerto `5432` (local) o el puerto asignado por Railway.
- El driver `pdo_pgsql` utiliza **prepared statements** sobre esa conexión TCP para enviar consultas SQL de forma segura (anti SQL injection).
- Las consultas SQL viajan como mensajes de texto sobre la conexión TCP establecida entre el servidor de aplicaciones y el servidor de base de datos.
- Los índices de base de datos optimizan las consultas que el backend realiza mediante peticiones HTTP, reduciendo el tiempo de respuesta de la API REST.
- Los triggers se ejecutan dentro del motor de base de datos en respuesta a operaciones `INSERT`/`UPDATE`/`DELETE` originadas por las peticiones HTTP de la aplicación.

---

## 6. Mara — Despliegue, Testing y Documentación

**Responsabilidad:** Despliegue del sistema, pruebas automatizadas, scripts de arranque, integración continua y documentación.

**Materia:** Laboratorio de programación / Telecomunicaciones.

**Partes clave del código:**

| Qué hace | Archivo y línea |
|---|---|
| Scripts de arranque local (doble clic en Windows) | `start-viajero.cmd`, `start-agente.cmd`, `start-railway.cmd`, `stop-railway.cmd` |
| Imagen de producción para Railway | `Dockerfile` |
| Stack local completo (API + Postgres) | `docker-compose.yml` |
| Archivos que se suben a Railway | `.railwayignore` |
| Archivos que se suben en el build de Docker | `.dockerignore` |
| Inicialización de BD en Railway (schema + seeds + migraciones) | `deploy/init-db.ps1` |
| URL pública de la API | `deploy/api-url.txt` |
| Pausar/reanudar API en Railway | `deploy/railway-pause.ps1`, `deploy/railway-resume.ps1` |
| Documentación versionada | `docs/` |
| Integración continua en GitHub Actions | `.github/workflows/ci.yml` |
| Tests de API portables (Node) | `tests/api.test.mjs` (16 checks) |
| Tests de cliente móvil (Node) | `tests/api_client_refresh.test.mjs` (4 checks) |
| Tests de API en PowerShell (Windows) | `tests/api_f2_auth.ps1`, `tests/api_f3_dominio.ps1`, `tests/api_f7_integracion.ps1`, `tests/api_f8_gestion.ps1` |
| Generador de JWT expirado para pruebas | `tests/mint_expired.php` |
| Endpoint de salud de la API (responde sin tocar BD) | `backend/public/index.php:62` (`GET /api/health`) |
| Endpoints públicos de autenticación | `backend/public/index.php:84-87` (`POST /register`, `/login`, `/refresh`, `/logout`) |

**Telecomunicaciones en esta sección:**
- El despliegue en Railway expone la API mediante una **URL pública HTTPS** (`https://api-production-88975.up.railway.app/api`).
- El **health check** de Railway realiza peticiones **HTTP GET** periódicas al endpoint `/api/health` para verificar que el servicio está vivo.
- El contenedor Docker escucha en el puerto inyectado por Railway (`$PORT`) y responde peticiones **HTTP** sobre **TCP**.
- Las apps móviles se conectan a la API mediante **peticiones HTTP** desde el celular a través de Wi-Fi o datos móviles.
- Los scripts de arranque (`start-*.cmd`) detectan la IP LAN de la PC y la escriben en el archivo `.env` de cada app para que el celular pueda conectarse a la API local por la red local.
- Las pruebas automatizadas se ejecutan contra la API levantada en `http://127.0.0.1:8000` o contra la URL de producción en Railway, verificando que los endpoints respondan correctamente mediante peticiones HTTP.
- La integración continua (CI) levanta PostgreSQL y la API en un entorno aislado, luego ejecuta las suites de pruebas mediante peticiones HTTP para validar el contrato de la API.

---

## 7. Flujo de una petición (telecomunicaciones + código)

```
Cliente (App móvil)
    │
    ├─ HTTP GET /api/health  ──►  TCP :8000/:443  ──►  backend/public/index.php:62
    ├─ HTTP POST /api/login  ──►  TCP :8000/:443  ──►  AuthController::login (AuthController.php:83)
    ├─ HTTP GET /api/itinerario ──►  TCP  ──►  ItinerarioController::show (ItinerarioController.php:4)
    ├─ HTTP POST /api/incidentes ──►  TCP  ──►  IncidentesController::crear (IncidentesController.php:22)
    ├─ HTTP PUT /api/admin/incidentes/{id} ──►  TCP  ──►  AdminController::actualizar (AdminController.php:128)
    │                                                    │
    │                                                    ▼
    │                                            PDO prepared statement
    │                                                    │
    │                                                    ▼
    │                                            PostgreSQL (TCP :5432)
    │                                                    │
    │                                                    ▼
    │                                            Respuesta JSON sobre TCP
    │                                                    │
    ▼                                                    ▼
Respuesta JSON (HTTP 200/201/400/401/403/404/409/429/500)
```

**Puntos de telecomunicaciones clave:**
1. **Capa de transporte:** Todas las comunicaciones cliente-servidor y servidor-BD usan **TCP** como protocolo de transporte.
2. **Capa de aplicación:** El sistema expone una **API REST** sobre **HTTP/1.1**. Los datos se intercambian en **JSON**.
3. **Seguridad en tránsito:** En producción, todo viaja sobre **HTTPS** (TLS sobre TCP), cifrando las credenciales y los datos de los viajeros.
4. **Autenticación stateless:** El servidor no guarda sesiones; cada petición HTTP lleva su propio token JWT en el header `Authorization`.

---

## 8. Glosario rápido de telecomunicaciones para la exposición

| Término | Qué significa en este sistema |
|---|---|
| HTTP | Protocolo de transferencia de hipertexto. Usado para toda la comunicación app ↔ API. |
| GET | Método HTTP para obtener datos (itinerario, incidentes, cola, salud). |
| POST | Método HTTP para crear datos (registro, login, incidente, respuesta, reclamar caso). |
| PUT | Método HTTP para actualizar datos (triaje de incidente, usuario). |
| DELETE | Método HTTP para eliminar (dejar de seguir un caso). |
| OPTIONS | Método HTTP para preflight de CORS. |
| TCP | Protocolo de control de transmisión. Usado por HTTP y por la conexión PHP → PostgreSQL. |
| UDP | No se usa en este sistema (HTTP requiere TCP). |
| JSON | Formato de intercambio de datos entre cliente y servidor. |
| REST | Estilo arquitectónico de la API: endpoints basados en recursos (`/incidentes`, `/usuarios`). |
| Puerto 8000 | Puerto local donde escucha la API en desarrollo. |
| Puerto 443 | Puerto estándar de HTTPS en producción (Railway). |
| Puerto 5432 | Puerto estándar de PostgreSQL (conexión PHP → BD). |
| Header Authorization | Cabecera HTTP que lleva el token JWT para autenticar cada petición. |
| Header Content-Type | Indica que el cuerpo de la petición/respuesta es JSON. |
| Código 429 | HTTP "Too Many Requests": rate limiting excedido. |
| Código 405 | HTTP "Method Not Allowed": el endpoint existe pero no acepta ese método HTTP. |

---

## 9. Referencia cruzada rápida (archivo y línea)

Para repasar antes de exponer:

- **Autoload:** `backend/src/bootstrap.php:5`
- **Rutas:** `backend/public/index.php:64-118`
- **Auth middleware:** `backend/src/Middleware/Auth.php:19`
- **JWT:** `backend/src/Utils/JwtHS256.php:12-46`
- **Modelo Incidente:** `backend/src/Models/Incidente.php`
- **Modelo Usuario:** `backend/src/Models/Usuario.php`
- **Schema BD:** `db/schema.sql:1-262`
- **Procedimiento seed:** `db/seed_demo.sql:8`
- **Trigger touch:** `db/schema.sql:146`
- **Trigger agente:** `db/schema.sql:157`
- **Función crear_respuesta:** `db/schema.sql:173`
- **App viajero:** `apps/viajero/`
- **App agente:** `apps/agente/`
- **Código compartido:** `apps/shared/`
- **Tests:** `tests/`
- **Despliegue:** `deploy/`, `Dockerfile`, `docker-compose.yml`

---

> **Nota:** Esta documentación fusiona el resumen técnico de código con la documentación completa de la carpeta `/yensel/` (guion de exposición, arquitectura, despliegue, testing y decisiones). Cada integrante tiene su sección asignada para preparar su parte de la exposición.