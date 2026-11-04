# 01 — Guion de exposición

Guía práctica para defender el proyecto. Ajustá los tiempos a los tuyos.

---

## 0. Antes de empezar (5 min)

- [ ] API **encendida**: doble clic en `start-railway.cmd` (deja todoandando y verificado).
      Si no lo tenés a mano: `deploy\railway-resume.ps1`.
- [ ] Celular con las apps **instaladas** (APK de EAS) o con Expo Go y Metro corriendo.
- [ ] `datos.md` abierto en otra pestaña: son las credenciales de prueba.
- [ ] `git log --oneline` a mano: la historia de commits habla sola (ver §7).

**Frase de apertura sugerida:**

> "El proyecto simula el canal de soporte de Despegar para incidentes críticos de viaje.
> Un viajero varado reporta el problema desde el celu; un agente de soporte lo ve en una
> cola priorizada por SLA, lo atiende y le responde; y un administrador da de alta los
> agentes. Todo loarmar es real: la API está desplegada en Railway con PostgreSQL."

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

**Problema.** Un viajero que queda varado (vuelo cancelado, hotel sin reserva) o que
sufre un cobro indebido pierde horas buscando un canal de soporte. Del lado de la
empresa, los casos llegan mezclados y nadie sabe cuál es urgente.

**Solución.** Dos apps y un backend:

- **Portal Ayuda al Viajero** (`viajero`): itinerario, reporte de incidente con 7 tipos,
  lectura de respuestas en hilo.
- **Centro de Resolución** (`agente`): cola global ordenada por urgencia real
  (SLA vencido → sin triage → crítico → alta → baja), filtros, triaje, respuesta,
  derivación, cierre.
- **Panel de administración** (`admin`): alta de agentes, promoción de roles,
  activación/desactivación de cuentas y **historial de cambios**.

**Lo que lo distingue (decilo explícitamente):**

1. **El SLA es real y no se puede maquillar**: el reloj se renueva solo cuando la
   prioridad *cambia*, no cuando se re-guarda el caso. Un agente no puede "refrescar"
   una SLA vencida.
2. **El rol se revalida contra la base en cada request**: degradar una cuenta corta el
   acceso en el acto, sin esperar a que expire el token.
3. **La trazabilidad es de verdad**: cada cambio de un usuario queda con actor, campo,
   valor anterior y nuevo, y motivo.
4. **Nada de mock**: la API está en Railway con PostgreSQL, hay CI que corre los tests
   en cada push, y hay APKs compilados en la nube de Expo.

---

## 3. Demo paso a paso (operativa)

### 3.1 Viajero
1. Abrí la app del viajero → login `ana@test.com` / `Viaje1234`.
2. **Viajes**: se ven 2 reservas (vuelo + hotel). Pull-to-refresh.
3. **Reportar**: elegí tipo *Vuelo cancelado*, escribí un título con la palabra
   "urgente" → la app sugiere prioridad. Enviá (pide confirmación).
4. **Incidentes**: aparece el caso nuevo con estado "Abierto".

### 3.2 Agente
5. Login `agente@despegar.com` / `Agente123`.
6. **Cola**: observá los chips de arriba (**Sin triar / Vencidos / Míos**) — son
   globales, calculados en el servidor, no de la página que estás viendo.
7. Ordená por "Urgentes": el caso vencido por SLA aparece primero.
8. Abrí un caso → **Reclamar** (pide confirmación) → pasa a "Lo tenés vos" y aparece
   en la pestaña **Míos**.
9. **Prioridad Crítica** → el SLA se recalcula a 4 h. Fijate en la fecha.
10. **Escribí una respuesta** → se suma al hilo.
11. **Marcar Resuelto** → pide confirmación y **exige prioridad previa** (probá
    resolver uno sin triage y mirá el error).
12. Volvé a la app del viajero: el estado cambió a "Resuelto" y aparece en el historial
    público del caso.

### 3.3 Admin
13. Login `admin@despegar.com` / `Admin1234`.
14. Pestaña **Administrar** (no la ve el agente: es por rol, no por pantalla).
15. **Registrar usuario nuevo** → creá `nuevo.agente@despegar.com` / `Prueba1234`,
    rol agente.
16. **Promover** a un viajero ya registrado: tocá el usuario → "Cambiar rol" → agente.
    Logueate con ese traveler: ahora entra como agente.
17. Abrí ese usuario → **Historial**: aparece quién hizo el cambio, el valor anterior y
    el nuevo, y el motivo.
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
Decisión deliberada y justificada en el plan: el proyecto evalúa POO, PDO y criptografía
sobre frameworks. `index.php` + tabla de rutas propia, sin Composer, cero dependencias
externas: el contenedor de build es `php:8.2-cli` con `pdo_pgsql` y nada más.

**"¿Por qué JWT HS256 a mano si existe firebase/php-jwt?"**
Para no agregar dependencias ni Composer al build, y para poder mostrar el criptograma
completo: `base64url(header).base64url(payload).HMAC-SHA256(secret)`, validación con
`hash_equals` y rechazo explícito de `alg != HS256`. Está en `backend/src/Utils/JwtHS256.php`
(47 líneas).

**"¿Cómo evitás que un agente se lleve el caso de otro?"**
Dos mecanismos: (a) el claim es atómico — `UPDATE … WHERE id=? AND (asignado_a IS NULL OR
asignado_a=?)` dentro de una transacción con `SELECT … FOR UPDATE` sobre la fila; (b)
si ya está asignado a otro, la API responde **409** y la app lo muestra.

**"¿Qué pasa si alguien degrada a un agente en pleno uso?"**
El token JWT sigue siendo válido hasta 8 h, pero **el rol se revalida contra la base en
cada request** (`Auth::rolVigente`). En la siguiente llamada, ese token recibe 403.

**"¿Cómo guardás las contraseñas?"**
bcrypt con salt automático (cost 10-12, configurable). Nunca se devuelven ni se registran:
la proyección `Usuario::toSafe()` expone solo id, nombre, email, rol y activo.

**"¿Y los refresh tokens?"**
Opaque (32 bytes aleatorios), la base guarda **solo el SHA-256**. Rotan en cada uso: el
anterior queda revocado, así que un token robado sirve una sola vez. 30 días de vida.

**"¿Tenés rate limiting?"**
Sí, y con archivo + `flock`, no en memoria: el server embebido de PHP corre varios
workers (`PHP_CLI_SERVER_WORKERS=8`) y un contador en memoria contaría por proceso. El
límite es por IP y por cuenta: login 30/min por IP y 20/min por cuenta, registro 30/h.
Al superarlo → **429** con `Retry-After`.

**"¿Cómo probaron que no se rompe?"**
78 checks automatizados: 58 en PowerShell (auth, dominio, integración, gestión), 16 en
Node (portable, es lo que corre el CI) y 4 del cliente móvil. El CI levanta PostgreSQL,
aplica el schema, levanta la API y corre todo en cada push. Aparte, un checklist manual
de 9 puntos en el dispositivo.

**"¿Qué falta / qué mejorarías?"**
Tené la respuesta lista en `09-decisiones-y-limitaciones.md`: no hay tests end-to-end
sobre dispositivo, la API es síncrona (un worker bloquea la request), no hay
observabilidad (solo `error_log`), y la sugerencia de prioridad son reglas, no un
modelo. Decilo con honestidad: es lo que atacaría primero.

**"¿Por qué el chatbot / la IA que había en el repo desapareceron?"**
Porque el alcance del grupo es el del borrador (viajero + agente + admin): el código de
IA/chatbot/adjuntos que estaba en una copia quedó fuera de alcance, no registrado en el
router y sin tests. Se eliminó para no entregar código muerto.

---

## 5. Preguntas feas (razonables) y cómo responder

- **"¿Cómo escalaría esto?"** → Hoy: PHP embebido con N workers + PostgreSQL único. Mañana:
  réplicas de lectura, cola de trabajo (la parte de IA/OCR es la candidata natural a
  asíncrono), y cache de la cola. Escribí lo que harías, no lo que ya hiciste.
- **"¿Por qué no usaste Axios?"** → `fetch` nativo alcanza, y con un interceptor manual
  queda más explícito el flujo de refresh (reintento único, refresco compartido entre
  requests concurrentes).
- **"¿Cómo probás la concurrencia?"** → A nivel de código, con `FOR UPDATE` y el
  `UPDATE` condicional; a nivel de test, el suite de Node cubre el 409 del claim. Lo
  que falta es un test de carga real con dos clientes concurrentes.
- **"¿Por qué guardás la API en Railway?"** → Facilidad de despliegue y costo: el plan
  gratuito con un Postgres de 500 MB y un sleep automático. Además, pausar con un script
  deja de facturar cuando no se demo (ver `07-despliegue-y-operacion.md`).

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

> "Lo que más nos costó fue que el sistema no permitiera hacer trampa: el SLA no se
> renueva si no cambia la prioridad, dos agentes no pueden tomar el mismo caso, y
> cualquier cambio de rol queda registrado con autor y motivo. Y todo eso está
> automatizado: 78 tests, un CI que corre en cada push, y la API real desplegada."

Y dejá abierta la pregunta: *"¿querés que les muestre la parte de la base de datos o
preferís que seea el panel de administración?"*
