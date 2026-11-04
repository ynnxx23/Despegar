# Conceptos del Sistema Despegar (Grupo 8)

> Explicación sencilla de los términos técnicos usados en el proyecto. Pensado para repasar antes de la exposición y para entender de qué habla cada integrante.

---

## Índice de conceptos

1. [Deploy](#deploy)
2. [Shared (código compartido)](#shared)
3. [schema.sql](#schemasql)
4. [Seed / seed_demo.sql](#seed)
5. [Middleware](#middleware)
6. [Router](#router)
7. [Controlador (Controller)](#controlador)
8. [Modelo (Model)](#modelo)
9. [Front-controller](#front-controller)
10. [JWT (JSON Web Token)](#jwt)
11. [Refresh token](#refresh-token)
12. [Trigger](#trigger)
13. [Función almacenada](#funcion-almacenada)
14. [Procedimiento almacenado](#procedimiento-almacenado)
15. [API REST](#api-rest)
16. [JSON](#json)
17. [CORS](#cors)
18. [CI / Integración Continua](#ci)
19. [Docker](#docker)
20. [Railway](#railway)
21. [PDO / Prepared statements](#pdo)
22. [Autoload](#autoload)

---

## 1. Deploy {#deploy}

**Qué es:** Es el proceso de poner una aplicación o servicio disponible para que otros lo usen. En este sistema, hacer deploy significa subir la API (backend) y la base de datos a un servidor en la nube (Railway) para que las apps móviles puedan conectarse desde cualquier celular.

**En el proyecto:**
- Se hace con la CLI de Railway (`railway up`) desde scripts `.cmd` o `.ps1`.
- La API viaja en un contenedor Docker (`Dockerfile` de la raíz).
- La base de datos corre como un servicio Postgres separado con su propio volumen.
- También existe despliegue local con `php -S` y `docker compose`.

**Analogía:** Es como mudarte a una casa nueva y dejarla lista para que cualquiera entre y la use.

---

## 2. Shared (código compartido) {#shared}

**Qué es:** Carpeta (`apps/shared/`) con código que usan las dos apps móviles (viajero y agente) para no duplicarlo. Incluye el cliente HTTP, la gestión de sesión, componentes de diseño, tema, formato de fechas y pantallas de login parametrizables.

**En el proyecto:** `apps/shared/` contiene `api.js`, `auth.js`, `session.js`, `components.js`, `theme.js`, `format.js`, `LoginScreen.js`, etc.

**Por qué existe:** Si ambos equipos (viajero y agente) escribieran su propio código de login, habría dos lugares donde corregir el mismo error. Con `shared/` se escribe una vez y se usa en ambas apps.

---

## 3. schema.sql {#schemasql}

**Qué es:** Archivo SQL que define la "estructura" de la base de datos: tablas, columnas, tipos de datos, restricciones (CHECK, UNIQUE), claves foráneas, índices, triggers y funciones. Es la "fuente de verdad" del modelo de datos.

**En el proyecto:** `db/schema.sql` define las 8 tablas (`usuarios`, `reservas`, `incidentes`, `respuestas`, `incidente_eventos`, `incidente_seguidores`, `refresh_tokens`, `usuarios_auditoria`), los 13 índices, los 2 triggers y las 9 rutinas SQL.

**Característica importante:** Es **destructivo** al empezar (hace `DROP TABLE … CASCADE`), así que solo se aplica sobre bases vacías.

---

## 4. Seed / seed_demo.sql {#seed}

**Qué es:** Datos iniciales de prueba que se cargan en la base para demostrar el sistema sin tener que crear todo a mano. Un "seed" suele ser idempotente: se puede correr varias veces sin duplicar registros.

**En el proyecto:** `db/seed_demo.sql` define el procedimiento `sembrar_demo()`, que crea:
- 2 admins
- 4 agentes
- 6 viajeros
- 10 reservas
- 14 incidentes (de los 7 tipos, en distintos estados)
- 7 respuestas de hilo
- Asignaciones y seguimientos de casos

Se invoca con `CALL sembrar_demo()` desde `db/seeds.sql`.

---

## 5. Middleware {#middleware}

**Qué es:** Código que se ejecuta en el medio, entre la llegada de la petición HTTP y el controlador que la atiende. Suele usarse para autenticación, seguridad, CORS, rate limiting, etc.

**En el proyecto:** `backend/src/Middleware/Auth.php` hace de middleware: extrae el token JWT del header `Authorization`, valida su firma y expiración, y consulta la base de datos para confirmar el rol del usuario. Si algo falla, devuelve 401 o 403 antes de llegar al controlador.

**Otros middlewares implícitos:** `Security.php` (headers de seguridad), `Cors.php` (cabeceras CORS), `RateLimit.php` (cuotas de peticiones).

---

## 6. Router {#router}

**Qué es:** El componente que decide a qué función o controlador enviar cada petición HTTP, basándose en la URL (ruta) y el método (GET, POST, PUT, DELETE).

**En el proyecto:** `backend/src/Utils/Router.php` mantiene una tabla de rutas. Ejemplo:

```php
$router->get('/api/admin/incidentes/resumen', ['agente','admin'], [AdminController::class,'resumen']);
```

Si la ruta requiere roles (`['agente','admin']`), el router ejecuta el middleware de auth antes de llamar al controlador. También devuelve errores 405 (método no permitido) y 404 (endpoint no encontrado) de forma correcta.

---

## 7. Controlador (Controller) {#controlador}

**Qué es:** Clase que recibe la petición ya autenticada, valida los datos que envía el cliente, llama a los modelos para leer/escribir en la base de datos y arma la respuesta JSON que se devuelve.

**En el proyecto:** Los controladores viven en `backend/src/Controllers/`:
- `AuthController.php` — login, registro, refresh, logout, me
- `IncidentesController.php` — incidentes del viajero
- `AdminController.php` — panel de agente (cola, triaje, responder, claim, etc.)
- `AdminUsuariosController.php` — panel de admin de usuarios
- `ItinerarioController.php` — reservas del viajero

**Regla de oro:** Los controladores **no hacen SQL directo**; eso lo hacen los modelos.

---

## 8. Modelo (Model) {#modelo}

**Qué es:** Clase que encapsula el acceso a la base de datos para una entidad específica. Contiene las consultas SQL preparadas y las reglas de validación de datos de esa entidad.

**En el proyecto:** `backend/src/Models/` contiene:
- `Usuario.php` — búsqueda, creación, hash de contraseña
- `Incidente.php` — sugerencia de prioridad, SLA, cola, proyecciones
- `Reserva.php` — itinerario del viajero
- `GestionCaso.php` — asignado, seguidores, eventos, historial
- `Respuesta.php` — hilo de respuestas
- `RefreshToken.php` — emisión, rotación, revocación
- `Auditoria.php` — historial de cambios de usuarios

---

## 9. Front-controller {#front-controller}

**Qué es:** Punto de entrada único de toda la aplicación web. Todas las peticiones HTTP pasan por un solo archivo (`index.php`), que se encarga de cargar configuración, conectar a la base de datos, aplicar seguridad y despachar al router.

**En el proyecto:** `backend/public/index.php` es el front-controller. No hay otros puntos de entrada públicos en el backend.

---

## 10. JWT (JSON Web Token) {#jwt}

**Qué es:** Un token de autenticación stateless (el servidor no guarda sesiones). Se firma criptográficamente y viaja en el header `Authorization: Bearer <token>` de cada petición. Contiene información del usuario (sub, rol, expiración).

**En el proyecto:** `backend/src/Utils/JwtHS256.php` implementa JWT HS256 a mano (47 líneas, sin librerías externas). Usa `hash_hmac` para firmar y `hash_equals` para comparar de forma segura contra ataques de temporización.

**Vida del token:** 8 horas por defecto (`JWT_TTL_HOURS`).

---

## 11. Refresh token {#refresh-token}

**Qué es:** Token de larga vida que se usa para obtener un JWT nuevo sin que el usuario vuelva a escribir su contraseña. Se guarda solo su hash en la base de datos (nunca el token crudo).

**En el proyecto:** `backend/src/Models/RefreshToken.php` gestiona la emisión, rotación y revocación. Al renovar, el refresh anterior queda revocado (un solo uso). Si se roba, solo sirve una vez.

**Vida:** 30 días por defecto (`REFRESH_TTL_DAYS`).

---

## 12. Trigger {#trigger}

**Qué es:** Objeto de base de datos que se ejecuta automáticamente cuando ocurre un evento (`INSERT`, `UPDATE`, `DELETE`) en una tabla. Sirve para aplicar reglas de integridad que no dependen de la aplicación.

**En el proyecto:** `db/schema.sql` define 2 triggers:
- `trg_incidentes_touch`: mantiene actualizada la columna `actualizado_at` automáticamente en cada modificación de incidentes.
- `trg_incidentes_agente`: valida que quien se le asigna un incidente tenga rol `agente` o `admin`.

---

## 13. Función almacenada {#funcion-almacenada}

**Qué es:** Rutina de SQL guardada en la base de datos que recibe parámetros, hace operaciones y devuelve un valor. Se puede llamar desde la aplicación.

**En el proyecto:** `db/schema.sql` define varias funciones:
- `crear_respuesta(p_incidente, p_autor, p_mensaje)` — inserta respuesta y pasa el caso a `EnGestion` en una sola transacción.
- `resumen_cola()` — conteos de incidentes por estado y prioridad.
- `upsert_usuario`, `upsert_reserva`, `upsert_incidente`, `upsert_respuesta` — helpers idempotentes del seed.

---

## 14. Procedimiento almacenado {#procedimiento-almacenado}

**Qué es:** Rutina de base de datos similar a una función, pero no devuelve valor directamente; se ejecuta con `CALL`. Se usa para tareas que modifican datos en bloque.

**En el proyecto:** `db/seed_demo.sql` define `sembrar_demo()` (PROCEDURE), que carga todos los datos de demostración de forma idempotente.

---

## 15. API REST {#api-rest}

**Qué es:** Estilo arquitectónico donde el servidor expone recursos (usuarios, incidentes, reservas) mediante URLs y los clientes interactúan con ellos usando métodos HTTP estándar.

**En el proyecto:** La API está bajo el prefijo `/api`. Endpoints principales:
- `GET /api/incidentes/mios` — obtener incidentes del viajero
- `POST /api/incidentes` — crear un incidente
- `PUT /api/admin/incidentes/{id}` — actualizar triaje de un caso
- `POST /api/login` — iniciar sesión

Todos los endpoints requieren autenticación JWT excepto los públicos (`/health`, `/register`, `/login`, `/refresh`, `/logout`).

---

## 16. JSON {#json}

**Qué es:** Formato de texto ligero para intercambiar datos entre cliente y servidor. Es el estándar de las APIs web modernas.

**En el proyecto:** Todas las respuestas del backend son JSON con este formato:
- Éxito: `{ "data": ... }`
- Error: `{ "error": { "code": 400, "message": "…", "details": {...} } }`

---

## 17. CORS {#cors}

**Qué es:** Mecanismo de seguridad del navegador que controla si una aplicación web desde un dominio puede hacer peticiones a un servidor de otro dominio.

**En el proyecto:** `backend/src/Utils/Cors.php` configura los headers `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers` y `Access-Control-Allow-Methods` según la variable de entorno `CORS_ORIGIN`. Por defecto no manda cabeceras CORS (las apps móviles nativas no las necesitan).

---

## 18. CI / Integración Continua {#ci}

**Qué es:** Práctica de desarrollo donde cada cambio de código se prueba automáticamente en un servidor aislado antes de integrarse. Si los tests fallan, el cambio no se acepta.

**En el proyecto:** `.github/workflows/ci.yml` corre en GitHub Actions en cada push:
1. Instala PHP 8.2 con `pdo_pgsql` y Node 20.
2. Aplica el schema y seeds de la base de datos.
3. Levanta la API en `http://127.0.0.1:8000`.
4. Ejecuta las suites de tests (Node y PowerShell).
5. Sube logs como artefacto si algo falla.

**Ventaja:** Cualquiera puede hacer fork del repo y tener CI verde sin configurar secretos.

---

## 19. Docker {#docker}

**Qué es:** Plataforma para empaquetar aplicaciones en contenedores: incluye todo lo necesario para correr (runtime, librerías, código) de forma aislada y reproducible.

**En el proyecto:** `Dockerfile` de la raíz crea una imagen mínima con `php:8.2-cli` + `pdo_pgsql`. `docker-compose.yml` levanta API y Postgres localmente para desarrollo.

**Ventaja:** El mismo contenedor que corre en la PC del desarrollador es el que corre en Railway.

---

## 20. Railway {#railway}

**Qué es:** Plataforma de despliegue en la nube que permite subir servicios (API, bases de datos) sin gestionar servidores manualmente.

**En el proyecto:** La API despliega en Railway como servicio `api` (con Docker), y la base de datos como servicio `Postgres` con volumen privado. Se controla con scripts `.cmd` (`start-railway.cmd`, `stop-railway.cmd`) para prender/apagar y ahorrar costos fuera de la demo.

**URL de producción:** `https://api-production-88975.up.railway.app/api`

---

## 21. PDO / Prepared statements {#pdo}

**Qué es:** Extensión de PHP para acceder a bases de datos. Los "prepared statements" son consultas SQL con placeholders (`?`) que se envían por separado de los datos, evitando inyección SQL.

**En el proyecto:** `backend/src/Database.php` crea un singleton PDO con `ATTR_EMULATE_PREPARES => false` (preparado nativo de PostgreSQL). Todos los modelos usan `$this->db->prepare('...')` y `$st->execute([...])`.

---

## 22. Autoload {#autoload}

**Qué es:** Mecanismo que carga automáticamente las clases de PHP cuando se necesitan, sin tener que escribir `require_once` para cada archivo a mano.

**En el proyecto:** `backend/src/bootstrap.php` registra un autoload con `spl_autoload_register` que busca las clases en `src/`, `src/Models/`, `src/Controllers/`, `src/Utils/` y `src/Middleware/`. `index.php` solo hace un `require_once` al bootstrap.

---

## Para Yensel (App del Viajero)

Tu parte del sistema está en:

| Componente | Ruta |
|---|---|
| Pantallas del viajero | `apps/viajero/` |
| Código compartido (ambas apps) | `apps/shared/` |
| Cliente HTTP (fetch + Bearer + refresh) | `apps/shared/api.js` |
| Sesión segura (SecureStore) | `apps/shared/auth.js` |
| Hook de sesión (`useSession`) | `apps/shared/session.js` |
| Componentes de UI compartidos | `apps/shared/components.js` |
| Tema y diseño | `apps/shared/theme.js` |
| Formato de fechas y etiquetas | `apps/shared/format.js` |
| Login por rol | `apps/shared/LoginScreen.js` |
| Configuración de Metro | `apps/viajero/metro.config.js` |

**Telecomunicaciones en tu módulo:** tu app hace **peticiones HTTP GET** a `/api/itinerario` y `/api/incidentes/mios` para obtener datos, y **peticiones HTTP POST** a `/api/incidentes` para enviar reportes. Todo viaja sobre **TCP** (puerto 8000 local / 443 en Railway) mediante **HTTPS**, con el token JWT en el header `Authorization: Bearer <token>`.

---

## Cómo convertir estos archivos a .odt

1. Abrí **LibreOffice Writer** (gratis) o **Microsoft Word**.
2. Abrí el archivo `.md` (por ejemplo `conceptos.md` o `exposicion.md`).
3. Vamos a **Archivo → Guardar como**.
4. Elegí el formato **ODT de texto** (OpenDocument Text).
5. Guardá con el nombre que quieras.

Los archivos `.md` están listos para usar tal cual en la exposición, y se convierten a .odt en menos de un minuto.
