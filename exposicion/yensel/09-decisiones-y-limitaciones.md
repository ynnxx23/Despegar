# 09 — Decisiones técnicas, límites y trabajo futuro

## 1. Decisiones (con su porqué y su consecuencia)

### D-01 · Backend en PHP 8.2 sin framework
**Contexto:** el enunciado evalúa POO, PDO y criptografía, y pide evitar dependencias
innecesarias.
**Decisión:** front-controller propio + tabla de rutas + Controllers + Models, sin
Composer y sin vendor.
**Consecuencia:** cero dependencias (build de 1 imagen con `php:8.2-cli` +
`pdo_pgsql`), control total del flujo y de los errores; a cambio, hay que escribir a
mano lo que un framework te da (routing, validación, DI, ORM, testing).

### D-02 · JWT HS256 implementado a mano
**Decisión:** `base64url(header).base64url(payload).HMAC-SHA256(secret)`, 47 líneas,
`hash_equals` para comparar firmas, rechazo explícito de `alg != HS256`.
**Consecuencia:** se puede explicar el criptograma entero en la defensa y no hay
dependencia ni Composer. Riesgo asumido: es código de seguridad escrito a mano (mitigado
con tests: token manipulado, expirado, reuso de refresh).

### D-03 · Sin ORM: PDO con consultas preparadas
**Decisión:** `PDO::prepare` + `execute` con parámetros, `ATTR_EMULATE_PREPARES=false`.
**Consecuencia:** SQL explícito y auditable, sin N+1 invisibles ni surprises de tipos;
a cambio, el mapeo objeto↔fila es manual (normalizado en `Incidente::norm()`).

### D-04 · Tabla de rutas propia
**Decisión:** `Router` con patrones `{id}`, roles declarativos, 405 real con header
`Allow` y alias `/api/v1`.
**Consecuencia:** el control de acceso está en un solo lugar (declararlo en la ruta) y
los errores HTTP son correctos; a cambio, no hay route-model binding ni middleware
en cadena (el middleware se aplica dentro del router).

### D-05 · El rol se revalida contra la base en cada request
**Contexto:** con el rol dentro del JWT, degradar a un agente tarda hasta 8 h (la vida
del token) en tener efecto.
**Decisión:** `Auth::rolVigente()` consulta `usuarios.rol` en cada request.
**Consecuencia:** la revocación es inmediata (requisito del enunciado) al precio de 1
SELECT por request. Es la decisión de seguridad central del proyecto.

### D-06 · Refresh token opaco con rotación de un solo uso
**Decisión:** 32 bytes aleatorios, en la base **solo el SHA-256**, y en cada refresh el
anterior queda revocado.
**Consecuencia:** un token robado sirve una sola vez; el logout revoca. Costo: un
refresh por sesiónrenew (tráfico chico) y una tabla que hay que purgar (ya se purga en
cada login).

### D-07 · Cuotas de peticiones en archivo con `flock`
**Contexto:** el server embebido de PHP corre con `PHP_CLI_SERVER_WORKERS=8`: un
contador en memoria contaría por proceso (8× el límite).
**Decisión:** archivo por clave con `flock(LOCK_EX)`, contadores con ventana
renovable y limpieza oportunista.
**Consecuencia:** el límite es real y compartido entre workers. A cambio: un sistema
de archivos en vez de Redis, y si el disco no es escribible hace *fail-open* (queda
logueado).

### D-08 · Integridad en la base, no solo en la app
**Decisión:** triggers para `actualizado_at` y para validar que `asignado_a` sea un
agente; `CHECK` en todos los valores cerrados; FK con `CASCADE`/`SET NULL` explícitos.
**Consecuencia:** la base no confía en que la app se comporte bien. Es la respuesta
directa a "las reglas de negocio están en un solo lado".

### D-09 · `prioridad` NULL + `prioridad_sugerida` aparte
**Decisión:** el caso entra sin triage; el sistema calcula una *sugerencia* con reglas
(tipo + keywords) y la **prioridad real** la pone un agente.
**Consecuencia:** el agente ve lo que hay que atender primero y el viajero recibe una
orientación sin que se le prometa nada. Es la diferencia entre "sugerir" y "decidir".

### D-10 · El SLA se renueva solo si cambia la prioridad
**Contexto:** si el SLA se recalculara en cada guardado, un agente podría "refrescar"
el reloj de un caso vencido y hacerlo desaparecer del contador.
**Decisión:** `AdminController::actualizar` calcula `$cambiaPrioridad` y lo pasa al
modelo; el `UPDATE` solo toca `sla_vence_at` si la prioridad cambió.
**Consecuencia:** el SLA mide el tiempo real de atención.

### D-11 · Claim atómico con `SELECT … FOR UPDATE`
**Decisión:** lock de fila + `UPDATE … WHERE asignado_a IS NULL OR asignado_a = yo` +
verificación de `rowCount`, todo en una transacción con el evento en el historial.
**Consecuencia:** dos agentes no pueden tomar el mismo caso; el segundo recibe 409.

### D-12 · Todo cambio de usuario queda auditado
**Decisión:** tabla `usuarios_auditoria` con actor, campo, valor anterior, valor nuevo
y motivo.
**Consecuencia:** se puede reconstruir quién cambió qué y por qué (y eso es requisito
del encargo). Costo: una escritura extra por cada cambio administrativo.

### D-13 · Proyecciones por rol en el backend
**Decisión:** `Incidente::toPublic()` (viajero) vs `toAgent()` (agente), `Usuario::toSafe()`
para todos. La forgetting de campos sensibles no depende de que la app la aplique.
**Consecuencia:** es imposible filtrar un campo por descuido en el front.

### D-14 · Código compartido en `apps/shared/`, monorepo sin workspaces
**Decisión:** una carpeta `shared/` importada por ruta; cada app con su
`metro.config.js` (`watchFolders` + `nodeModulesPaths` local).
**Consecuencia:** el login, los componentes, el cliente HTTP, la sesión y el tema están
**una sola vez** (requisito del enunciado), y las apps pueden usar versiones
distintas de una dependencia. Costo: no hay tooling de monorepo (no hay type-checking
cruzado ni tests compartidos automáticos).

### D-15 · Un error de red no destruye la sesión
**Contexto:** antes, cualquier fallo de `api.me()` (incluido un timeout) borraba
SecureStore y obligaba a loguearse de nuevo, dejando un refresh token vivo 30 días.
**Decisión:** `useSession` distingue 401 (sesión inválida → cerrar) de cualquier otro
error (offline/timeout/500 → conservar la sesión y avisar).
**Consecuencia:** el usuario no pierde su sesión por un problema de red.

### D-16 · Contrato OpenAPI + suite de tests portable
**Decisión:** `docs/openapi.yaml` (OpenAPI 3.0.3, 30 operaciones, verificado 1:1
contra el router) y la suite de API en Node (`node:test`, sin dependencias) en vez de
solo PowerShell.
**Consecuencia:** el CI corre en Linux sin instalar nada raro, y el contrato se puede
diffear y documentar automáticamente.

### D-17 · Pausar el proyecto en Railway fuera de la demo
**Decisión:** `stop-railway.cmd` / `deploy\railway-pause.ps1` apagan ambos servicios
(el healthcheck deja de generar tráfico y `railway down` libera los contenedores).
**Consecuencia:** 0 CPU / 0 RAM facturados fuera de la demo, con los datos intactos en
el volumen. Costo: hay que prender la API para cada demo (1-2 min).

### D-18 · Distribución con APK standalone (EAS)
**Decisión:** además del flujo de desarrollo con Expo Go, se compila un APK por
proyecto de EAS con la URL de la API incrustada.
**Consecuencia:** la app se puede demostrar en el celu **sin PC, sin Metro y sin la
misma Wi-Fi**. Costo: EAS necesita una cuenta (gratis) y el APK hay que recompilarlo
cuando cambia el código.

### D-19 · Se eliminó el código de IA/chatbot/adjuntos
**Contexto:** el repo tenía (en otra línea de historia) un chatbot, heurística de IA,
OCR, adjuntos, push y notificaciones. Ninguno estaba registrado en el router, sin
tests, y con una migración incompatible con nuestro schema.
**Decisión:** borrar ese código y dejar solo lo que el proyecto expone; su documentación
histórica quedó fuera del repo (en `.git/info/exclude`).
**Consecuencia:** el repo entregado tiene cero código muerto y el alcance coincide con
el borrador.

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

1. **Observabilidad**: logging estructurado con `request-id`, métricas de latencia y
   errores por código, y un health check que真的有 chequee de la base.
2. **Tests end-to-end del backend**: subir la suite de Node a 40-50 checks y agregar un
   test de concurrencia real (dos clientes节能环保 con el mismo caso).
3. **Tests de la app**: React Native Testing Library para `useSession`, `api.js` y el
   reducer de la cola.
4. **Pasar a una cola de trabajo** para la parte que hoy es síncrona (reportes con
   adjuntos/análisis sería el candidato natural).
5. **Push notifications** con el módulo que quedó en la copia del repo, si el alcance
   lo permite.
6. **iOS**: dejar el `eas.json` listo (ya está) y publicar en TestFlight.
7. **Versionado de esquema**: formalizar `/api/v1` con política de deprecación.
8. **Sugerencia de prioridad** como modelo: aprender de la resolución real del agente
   en lugar de reglas fijas.

---

## 4. Preguntas de la devolución (con respuesta corta)

**"¿Qué fue lo más difícil?"**
Que el sistema no permitiera hacer trampa. Tres casos concretos: el SLA que se
renovaba solo al re-guardar, el claim que dos agentes podían "ganar" al mismo tiempo
y el rol que seguía valiendo 8 horas después de degradar una cuenta. Los tres se
resolvieron con la misma idea: **la regla se aplica en el servidor y, cuando se puede,
en la base de datos** (transacciones, locks, triggers).

**"¿Qué cambiarías de la arquitectura?"**
El backend es síncrono y sin observabilidad: para una carga real, lo primero es
logging estructurado y una cola. Y me gustaría haber versionado el esquema desde el
principio (hay un alias `/api/v1`, pero no una política de deprecación real).

**"¿Por qué no usaste la IA que había en el repo?"**
Ese código venía de otra línea de trabajo y no estaba integrado: sus endpoints no
estaban en el router, sus migraciones no eran compatibles con nuestro schema y no
tenía tests. El alcance del grupo es el del borrador (viajero, agente y admin), así
que preferimos entregar un sistema completo y probado antes que un alcance más amplio
a medio integrar.

**"¿Qué aprendieron como equipo?"**
A leer el código de los otros y a discutir las decisiones con argumento: cada vez que
cambió una regla de negocio (SLA, claim, roles) hubo que tocar el backend, la base y
las dos apps, y el test que lo cubría. Eso es lo que hace que el proyecto se sostenga.
