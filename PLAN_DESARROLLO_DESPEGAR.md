# PLAN DE DESARROLLO — DESPEGAR (Grupo 8: Gestión de Incidentes Críticos)
> Fuente de verdad: `proyecto_borrador_alumnos.docx` (Grupo 8, líneas 58-65 + Requisitos Transversales 67-71), `Preguntas_Integrador_6IV.docx` (restricciones de stack), `Investigacion_Despegar.docx` + `liderazgo.docx` (contexto negocio, NO requisitos funcionales). Fecha plan: 2026-10-06. Estado: PLANIFICACIÓN — NO IMPLEMENTAR CÓDIGO AÚN.

---

## 1. Resumen completo del proyecto

**Problema que resuelve:** Despegar maneja alto volumen de reservas. Cuando un viajero queda varado (vuelo cancelado, hotel no reconoce reserva) o hay fraude, necesita un canal ágil para reportar el incidente crítico y recibir respuesta; y el equipo de soporte necesita una cola ordenada para priorizar y resolver. Sin esto, consultas se pierden en canales genéricos, no hay trazabilidad ni SLA por prioridad.

**Alcance estricto (Grupo 8):** 2 apps móviles + 1 backend compartido + 1 BD compartida.

- **App 1 — Portal de Ayuda al Viajero (rol `viajero`):** login, ver itinerario vuelos/hoteles, crear reporte de incidente (POST), leer respuestas de soporte (GET).
- **App 2 — Centro de Resolución de Conflictos (rol `agente`):** login empleado, ver cola de incidentes ordenada por fecha (GET), cambiar prioridad (Baja/Alta/Crítica) y estado a Resuelto + responder (PUT/POST).
- **Backend PHP + MySQL:** REST JSON, hash bcrypt, JWT HS256, control de roles (token viajero NO accede a endpoints admin).

**Lo que NO incluye (para evitar scope-creep):** no hay compra/reserva de viajes, ni pagos, ni chat en tiempo real (sockets), ni IA, ni programa Pasaporte, ni panel B2B de agencias. Esos temas aparecen en `Investigacion_Despegar.docx` como contexto de negocio, no como requisito del borrador.

**Usuarios:** (1) Viajero (cliente que compró un viaje). (2) Agente de atención al cliente (empleado Despegar). (3) Admin implícito = agente con permisos globales (no se pide rol superadmin separado; se documenta como ambigüedad §22).

**Procesos clave:** Viajero: registro → login → ver itinerario → reportar incidente → consultar respuestas. Agente: login → ver cola → tomar incidente → responder / cambiar prioridad → marcar Resuelto → impacto visible en App 1.

**Datos:** usuarios, reservas/itinerario, incidentes, respuestas/mensajes.

**Pantallas mínimas:** App1: Login, Registro, Itinerario, Mis Incidentes, Detalle Incidente + Respuestas, Crear Incidente. App2: Login, Cola Incidentes (filtros), Detalle + Cambiar prioridad/estado + Responder.

**Stack obligatorio:** React Native + Expo + JavaScript + HTML/CSS (vía JSX/StyleSheet), PHP backend (POO + PDO), Docker solo si aporta valor. Ver §10 y §21.

---

## 2. REQUISITOS EXTRAÍDOS DE LOS DOCUMENTOS

Convención: `[BORR-G8]` = borrador Grupo 8, `[TRANS]` = requisitos transversales, `[PREG]` = preguntas integrador (stack a evaluar), `[INV]` = investigación (contexto, no exigible).

### Funcionales

| ID | Requisito | Origen | App | Trazabilidad |
|----|-----------|--------|-----|--------------|
| RF-01 | Registro de usuarios con contraseña hasheada, nunca texto plano | [TRANS-68] | Ambas (alta viajero; alta agente por seed/admin) | Tabla `usuarios.password_hash`, `POST /api/register` |
| RF-02 | Login valida credenciales y devuelve Token (JWT) sin sesión en servidor | [TRANS-69] | Ambas | `POST /api/login` |
| RF-03 | App guarda token seguro y lo envía en `Authorization: Bearer <jwt>` con Axios/Fetch | [TRANS-70] | Ambas | Expo SecureStore + interceptor |
| RF-04 | Viajero ve su itinerario vuelos/hoteles tras login | [BORR-G8-61] | App1 | `GET /api/itinerario` |
| RF-05 | Viajero crea incidente crítico vía POST (ej. vuelo cancelado, hotel no reconoce reserva) | [BORR-G8-62] | App1 | `POST /api/incidentes` |
| RF-06 | Viajero lee respuestas de soporte a su incidente | [BORR-G8-62] | App1 | `GET /api/incidentes/:id/respuestas` |
| RF-07 | Agente visualiza cola de incidentes ordenada por fecha | [BORR-G8-65] | App2 | `GET /api/admin/incidentes?orden=fecha` |
| RF-08 | Agente cambia prioridad (Baja/Alta/Crítica) y estado a Resuelto | [BORR-G8-65] | App2 | `PUT /api/admin/incidentes/:id` |
| RF-09 | Agente responde al incidente (implícito en "comunicó con aerolínea/hotel" + RF-06 exige que haya algo que leer) | [BORR-G8-62+65] inferido | App2 | `POST /api/admin/incidentes/:id/respuestas` |
| RF-10 | Control de accesos: token viajero NO accede a endpoints admin; token agente tiene permiso global | [TRANS-71] + [BORR-G8-09 patrón Pomelo] | Backend | Middleware `requireRole('agente')` → 403 |
| RF-11 | API REST con GET/POST/PUT, URLs sustantivos plural, JSON, códigos HTTP | [PREG-31..38] | Backend | §8 |

### No funcionales

| ID | Requisito | Origen |
|----|-----------|--------|
| RNF-01 | Contraseñas bcrypt/argon2 + JWT firmado SHA-256 (HS256 si clave compartida), con expiración/validación/renovación/invalidación | Prompt §4 + [TRANS-68/69] + [PREG-94..97] |
| RNF-02 | Validación + sanitización entradas, PDO prepared (anti SQLi), manejo seguro errores, secretos en `.env`, CORS/SOP correctos | [PREG-25/26/92/93] + Prompt §4 |
| RNF-03 | Apps Expo/React Native JS; componentes reutilizables; estados carga/vacío/error/éxito; táctil ≥44pt; accesibilidad | [PREG-39..63] + Prompt §6 |
| RNF-04 | Docker: contenedor = código+runtime+deps; VM vs contenedor; imagen/capas; volúmenes persistencia; Compose orquestador. Usar solo si ventaja real | [PREG-01..10] + Prompt §3 |
| RNF-05 | Interoperabilidad móvil↔PHP vía contrato API/JSON + abstracción (cliente no conoce SQL interno) | [PREG-27..30] |
| RNF-06 | Red/transporte: distinguir bits vs Bytes, latencia/jitter; priorizar payloads JSON livianos, paginación | [PREG-64..89] |

### Lo que es contexto y NO requisito

- Misión/visión/FODA, Pasaporte Despegar, agencias afiliadas, IA asistente, IPO/Prosus/CEO 2026, organigrama, liderazgo, comunicación interna: de `[INV]` y `liderazgo.docx`. Útil para tono/UX, no genera endpoints ni tablas.

---

## 3. Contradicciones, ambigüedades y faltantes (resolución propuesta)

1. **Token: "JWT o token aleatorio temporal" [TRANS-69] vs prompt exige JWT HS256.** Decisión: JWT HS256 obligatorio (cumple ambas: es token y es JWT). No implementar tokens opacos.
2. **Registro de agentes no especificado.** Borrador solo dice "inicia sesión". Propuesta: seed de 1 agente en BD + `POST /api/register` solo crea `viajero`; crear agente solo vía seed o endpoint admin. Evita escalada de privilegios.
3. **Estados de incidente:** solo se menciona "Resuelto". Propuesta: `Abierto → EnGestion → Resuelto` (mínimo necesario para cola útil). Prioridad enum `Baja,Alta,Critica` (sin tilde en BD/API por compatibilidad; mostrar "Crítica" en UI).
4. **"Ordenados por fecha" sin dirección.** Decisión: `created_at ASC` por defecto (más antiguos primero = FIFO urgencias), con param `?orden=asc|desc` y filtros `?estado=&prioridad=`.
5. **Tipos de incidente:** ejemplos sueltos. Decisión: `tipo ENUM('Vuelo_cancelado','Hotel_sin_reserva','Fraude','Otro')` + `titulo, descripcion`. Suficiente sin sobrediseñar.
6. **Itinerario:** ¿de dónde sale? No hay endpoint de compras. Decisión: tabla `reservas` precargada (seed por usuario) solo lectura para viajero; no implementar CRUD de reservas en esta versión. Documentar como límite.
7. **Expiración JWT, renovación, longitud password:** transversales no fijan valores. Decisión: JWT exp 8h, sin refresh en v1 (re-login); password mín 8 caracteres (toma referencia Grupo 2 Ualá, coherente y defendible); bcrypt cost 10.
8. **¿PUT cambia prioridad y estado juntos o separados?** Decisión: un solo `PUT /api/admin/incidentes/:id` con body parcial `{prioridad?, estado?, asignado?}`.
9. **Documentos de negocio vs borrador:** si `Investigacion` sugiere "comprar vuelos", se ignora — manda borrador Grupo 8 (regla §2 del prompt).

---

## 4. Las dos aplicaciones y responsabilidades

| | App 1 Viajero | App 2 Agente |
|---|---|---|
| Rol | `viajero` | `agente` |
| Auth | Registro + Login | Solo Login (cuenta seed) |
| Lectura | `GET /api/itinerario`, `GET /api/incidentes/mios`, `GET /api/incidentes/:id/respuestas` | `GET /api/admin/incidentes`, `GET /api/admin/incidentes/:id` |
| Escritura | `POST /api/incidentes` | `PUT /api/admin/incidentes/:id`, `POST /api/admin/incidentes/:id/respuestas` |
| Prohibido | Cualquier `/api/admin/*` → 403 | Ver itinerarios de otros (solo incidentes) |
| Pantallas | Login, Registro, Itinerario, MisIncidentes, Detalle, NuevoIncidente | Login, Cola, DetalleGestion |
| Compartido | Backend, BD, JWT, componentes UI base (Button, Card, Input, Badge), cliente Axios | idem |

---

## 5. Arquitectura propuesta

```
despegar/
  PLAN_DESARROLLO_DESPEGAR.md (este archivo)
  docker-compose.yml (opcional, solo dev BD+API)
  backend/ (PHP 8.2 POO + PDO, sin framework)
    public/index.php (front-controller + router)
    src/{Config,Database,Models,Controllers,Middleware,Utils}.php
    .env (DB_*, JWT_SECRET, BCRYPT_COST) — nunca commitear
  apps/
    viajero/ (Expo RN) — pantallas §4 App1
    agente/  (Expo RN) — pantallas §4 App2
    shared/  (cliente api.js, theme.js, componentes base)
  db/{schema.sql,seeds.sql}
```

- **Comunicación:** `Fetch/Axios → HTTPS → PHP REST JSON → PDO → MySQL`. Stateless: cada request lleva `Authorization: Bearer JWT`. CORS restringido en prod.
- **Auth:** `password_hash(PASSWORD_BCRYPT) / password_verify`; JWT `header.payload.signature` HS256 con `hash_hmac('sha256')`; claims `{sub, rol, exp, iat}`; nunca password/datos sensibles en payload. Validación en middleware; 401 token inválido/expirado, 403 rol insuficiente.
- **Errores:** formato `{error:{code,message,details?}}`; nunca stack traces ni SQL a cliente; log en servidor.
- **Config:** todo secreto por env. Sin secretos hardcodeados.

### Estructura de carpetas (responsabilidad)

- `backend/public`: único punto entrada. `backend/src/Config`: lee env. `Database`: singleton PDO. `Models`: Usuario, Reserva, Incidente, Respuesta (encapsulamiento, prepared). `Controllers`: Auth, Itinerario, Incidentes, Admin. `Middleware`: AuthJWT, RequireRole, Validate, Cors. `Utils`: JwtHS256, Validator.
- `apps/*/screens|components|navigation|store`: pantallas por rol; `shared/theme.js`: tokens diseño; `shared/api.js`: Axios con interceptor Bearer + manejo 401 (logout).
- `db/`: schema + seeds (1 agente, 2 viajeros con reservas e incidentes ejemplo).

---

## 6. Base de datos

**Entidades:** `usuarios(id PK, nombre, email UNIQUE NOT NULL, password_hash NOT NULL, rol ENUM('viajero','agente') NOT NULL, creado_at)`. `reservas(id PK, user_id FK→usuarios, tipo ENUM('vuelo','hotel'), codigo VARCHAR(20) NOT NULL, origen/destino/hotel, fecha_inicio, fecha_fin, estado VARCHAR(20), creado_at)`. `incidentes(id PK, user_id FK, reserva_id FK NULL→reservas (SET NULL), tipo ENUM, titulo VARCHAR(120) NOT NULL, descripcion TEXT NOT NULL, prioridad ENUM('Baja','Alta','Critica') DEFAULT 'Baja', estado ENUM('Abierto','EnGestion','Resuelto') DEFAULT 'Abierto', creado_at, actualizado_at, INDEX(user_id, estado, prioridad, creado_at))`. `respuestas(id PK, incidente_id FK→incidentes CASCADE, autor_id FK→usuarios, mensaje TEXT NOT NULL, creado_at)`.

**Relaciones:** usuarios 1:N reservas; usuarios 1:N incidentes; reservas 1:N incidentes (opcional N:1); incidentes 1:N respuestas. Sin N:M (no se crea tabla puente innecesaria).
**Integridad:** FK con `ON DELETE CASCADE` (respuestas) / `SET NULL` (reserva opcional); NOT NULL en obligatorios; UNIQUE email; CHECK longitud password se valida en app (hash siempre 60 chars); normalización 3FN (sin campos multivalor; dirección hotel atomizada mínima).
**Índices:** `incidentes(estado, prioridad, creado_at)` para cola; `incidentes(user_id)` para "míos".

---

## 7. API propuesta (REST, JSON, sustantivos plural)

Base `/api`. Auth: `Authorization: Bearer <jwt>` salvo register/login.

| Método | Ruta | Rol | Body/Params | Éxito | Errores |
|---|---|---|---|---|---|
| POST | `/api/register` | público | `{nombre, email, password≥8}` | 201 `{user{id,nombre,email,rol}}` | 400 validación, 409 email existe |
| POST | `/api/login` | público | `{email, password}` | 200 `{token, user{id,rol,nombre}}` | 401 credenciales |
| GET | `/api/me` | auth | — | 200 user | 401 |
| GET | `/api/itinerario` | viajero | — | 200 `[{reserva}]` | 401/403 |
| GET | `/api/incidentes/mios` | viajero | `?estado=` | 200 `[{incidente}]` | 401/403 |
| POST | `/api/incidentes` | viajero | `{reserva_id?, tipo, titulo, descripcion}` | 201 incidente (prioridad=Baja, estado=Abierto) | 400/401/403/404 reserva ajena |
| GET | `/api/incidentes/:id` | dueño o agente | — | 200 incidente+reserva | 401/403/404 |
| GET | `/api/incidentes/:id/respuestas` | dueño o agente | — | 200 `[{respuesta}]` | 401/403/404 |
| GET | `/api/admin/incidentes` | agente | `?estado=&prioridad=&orden=asc\|desc&page=&limit=` | 200 `{data[], total}` orden fecha ASC defecto | 401/403 |
| PUT | `/api/admin/incidentes/:id` | agente | `{prioridad?, estado?}` | 200 incidente actualizado | 400 enum inválido, 401/403/404 |
| POST | `/api/admin/incidentes/:id/respuestas` | agente | `{mensaje}` | 201 respuesta | 400/401/403/404 |

Validaciones: email formato, password ≥8, título 5-120, descripción 10-2000, enums estrictos, `reserva_id` debe pertenecer al viajero. Códigos: 200/201/400/401/403/404/409/422/500.

---

## 8. Autenticación y seguridad (diseño antes de codificar)

- **Hash:** `password_hash($p, PASSWORD_BCRYPT, ['cost'=>10])` (salt auto); verifica `password_verify`. Nunca loguear ni devolver hash.
- **JWT HS256 manual (sin dependencia externa — ver §11 Decisiones):** `base64url(header).base64url(payload).HMAC-SHA256(secret)`; `exp = now+8h`, `iat`; valida firma con `hash_equals`, valida `exp`; rechaza `alg != HS256`. Almacén móvil: `expo-secure-store` (no AsyncStorage plano). Logout = borrar token (stateless; blacklist v2 si se exige invalidación inmediata).
- **Autorización:** middleware `AuthJWT → RequireRole`; viajero solo ve `WHERE user_id = sub`; agente acceso global. Tests deben probar 403 cruzado.
- **Entradas:** validación whitelist + `PDO::prepare` + `htmlspecialchars` al render si aplica; límite longitudes y paginación (`limit ≤50`); `Content-Type: application/json`; CORS allowlist; headers `X-Content-Type-Options, X-Frame-Options`; rate-limit básico login (ej. 10 intentos/min/IP) en v1 a nivel PHP.
- **Secretos:** `.env` (`JWT_SECRET ≥32 bytes`, `DB_*`); `.env.example` commiteado, `.env` ignorado. Docker secrets/env-file, nunca en imagen.

---

## 9. Identidad visual Despegar (referencia, no copia)

Investigación web (rebrand 2019 Saffron): Despegar pasó de logo literal (avión+timbre, CMYK apagado) a imagotipo **D dinámica con línea de viaje**, tipografía **geométrica bold**, paleta amplia y audaz con dominante **violeta/morado** + acentos cálidos. Tono: cercano, dinámico, emocional ("Vivir viajando").

**Decisiones propias para este proyecto:**
- Primario violeta ` #6C2BD9` (inspirado Despegar, no valor exacto corporativo), primario oscuro `#4A1FA3`, acento coral/naranja viaje `#FF6B35`, éxito `#16A34A`, alerta crítica `#DC2626`, fondo `#F6F5FB`, texto `#1E1B2E`, muted `#6B7280`.
- Tipografía sistema (sin agregar fuentes externas en v1): `System` bold para títulos, regular cuerpo; jerarquía 24/18/16/14.
- Componentes: botones radius 12, altura 48; cards radius 16 + sombra suave; inputs borde 1 + foco violeta; badges prioridad (Baja gris, Alta naranja, Crítica roja); estados selección violeta tenue.
- Iconografía propia (Ionicons de Expo, ya incluido): avión, cama hotel, alerta, check. Espaciado base 8. Navegación bottom-tabs App1, stack+list App2.

---

## 10. Sistema de diseño + HCI por pantalla

Tokens en `apps/shared/theme.js` (colores, spacing, radius, type). Componentes base: `Button, Card, TextInput, BadgePrioridad, EstadoVacio, Loader, ErrorBanner`.

| Pantalla | HCI aplicado |
|---|---|
| Login/Registro | Reconocimiento>recuerdo (placeholders+labels), prevención (validación inline, mostrar/ocultar pass), feedback inmediato, accesibilidad (labels, contraste ≥4.5, táctil 48), error comprensible ("Email ya registrado" no "409"). |
| Itinerario | Visibilidad estado (próximo viaje destacado), carga cognitiva baja (card vuelo/hotel con fecha+origen/destino), vacío ("Aún no tienes viajes" + CTA ayuda), pull-to-refresh. |
| Nuevo Incidente | Prevención (select tipo + contador caracteres), confirmación antes de enviar (acción no reversible), éxito ("Reporte #12 creado, te avisaremos"). |
| Mis Incidentes/Detalle | Consistencia (misma card en ambas apps), feedback (badge estado/prioridad), respuestas en hilo cronológico. |
| Cola Agente | Eficiencia (orden fecha ASC, filtros estado/prioridad, paginación), visibilidad (contador pendientes, highlight Crítica), confirmación al marcar Resuelto. |

Accesibilidad global: tamaños táctiles, foco visible, mensajes no solo por color (icono+texto).

---

## 11. Matriz de asignación de modelos IA

> Nota honesta: no hay benchmarks públicos comparables de estos 5 modelos gratuitos en OpenCode para estas tareas; la asignación es **provisional y por rol general**, a validar por rendimiento observado en Fase 0-1. Si un modelo rinde peor, se reasigna.

| Área | Tarea | Principal | Secundario | Motivo |
|---|---|---|---|---|
| Análisis | Requisitos, ambigüedades | Nemotron 3 Ultra | Muse Spark 1.3 | Ultra: razonamiento largo; Spark verifica |
| Arquitectura | Estructura, API, BD | Nemotron 3 Ultra | Muse Spark 1.3 | Diseño coherente + revisión |
| Frontend | UI Expo RN App1+App2 | Muse Spark 1.3 Free | Space Bunny | Spark código general; Bunny variantes creativas UI |
| Backend | PHP POO/PDO/JWT | Muse Spark 1.3 Free | Nemotron 3.5 Lightning | Spark genera, Lightning itera rápido fixes |
| Base de datos | schema/seeds/normalización | Nemotron 3 Ultra | LogCat 2.5 Preview | Ultra modela, LogCat revisa integridad |
| Seguridad | Auth, roles, validación | Nemotron 3 Ultra | LogCat 2.5 Preview | Ultra threat-model; LogCat busca fallos/logs |
| UX/HCI | Sistema diseño, revisión | Space Bunny | Muse Spark 1.3 | Bunny sensibilidad visual; Spark implementa |
| Testing | Casos + scripts | Nemotron 3.5 Lightning | LogCat 2.5 Preview | Lightning genera rápido; LogCat analiza fallos |
| Revisión | Code review cruzado | LogCat 2.5 Preview | Nemotron 3 Ultra | LogCat caza bugs; Ultra valida arquitectura |
| Documentación | README, API docs | Muse Spark 1.3 Free | Space Bunny | Spark redacta técnica; Bunny tono claro |

Regla: toda tarea importante la implementa uno y la revisa otro ( §16).

---

## 12. Trabajo paralelo y dependencias

**FASE 0 — Análisis (bloqueante):** leer docs → este plan. Sin esto nada más arranca.
**FASE 1 — (paralelo tras aprobar plan):** arquitectura carpetas + diseño BD (schema) + sistema diseño tokens. Requieren solo el plan.
**FASE 2 — Backend núcleo (secuencial interno):** `db/schema` → `Auth/register/login/JWT` → `Incidentes viajero` → `Admin`. No paralelizar endpoints admin antes de auth.
**FASE 3 — (paralelo entre sí, dependen de FASE 2 contrato API):** App1 + App2 UI con mocks; integración real cuando backend α esté arriba.
**FASE 4 — Integración:** cablear Axios+JWT, probar flujo viajero→agente→viajero.
**FASE 5 — Testing + Seguridad:** casos, 403 cruzado, SQLi, JWT expirado.
**FASE 6 — Revisión cruzada + correcciones + pulido.**

Dependencias duras: BD → Backend → Integración → Testing. Independientes: tokens UI vs schema DB vs docs.

---

## 13. Plan de desarrollo por fases (objetivo, tareas, modelo, archivos, salida, done)

- **F0 Análisis:** objetivo este documento. Modelo Ultra+Spark. Archivos: este `.md`. Done: plan aprobado.
- **F1 Arquitectura+BD+Diseño:** Ultra (BD), Bunny (tokens). Archivos: `db/schema.sql`, `backend/public/index.php` esqueleto, `apps/shared/theme.js`. Done: carpetas + schema revisado.
- **F2 Backend Auth:** Spark+Lightning. Archivos: `src/Utils/JwtHS256.php, src/Models/Usuario.php, src/Controllers/AuthController.php`. Done: register/login generan JWT válido, hash bcrypt verificado.
- **F3 Backend dominio:** Spark. Archivos: `Incidente/Respuesta/Reserva models+controllers`, `Middleware/*`. Done: matriz §7 pasa con Postman (viajero 403 en /admin).
- **F4 Auth móvil:** Spark. Archivos: `apps/*/screens/Login, Registro + shared/api.js + SecureStore`. Done: login guarda token y navega por rol.
- **F5 App1:** Spark+Bunny. Archivos: `apps/viajero/*`. Done: itinerario, crear y leer incidentes/respuestas con estados carga/vacío/error.
- **F6 App2:** Spark+Bunny. Done: cola ordenada, filtros, PUT prioridad/estado, responder.
- **F7 Integración:** Lightning. Done: reporte App1 aparece en App2; respuesta App2 visible en App1; JWT expirado → logout.
- **F8 Validaciones+Docker opcional:** LogCat. Archivos: `docker-compose.yml` (php+mysql+volumen), validaciones. Done: `docker compose up` levanta stack; sin Docker también corre con XAMPP.
- **F9 Testing:** Lightning+LogCat. Done: checklist manual + script `test-api.ps1` (register/login/403/SQLi/exp).
- **F10 Seguridad:** Ultra+LogCat. Done: sin passwords en logs/JWT, PDO everywhere, CORS, env.
- **F11 Pulido/Entrega:** Spark. Done: README, capturas, demo.

---

## 14. Plan de commits (pequeños, lógicos)

```
docs: agregar plan desarrollo Despegar Grupo 8
feat: estructura base backend + frontend + db
feat(db): schema usuarios/reservas/incidentes/respuestas + seeds
feat(auth): registro bcrypt + login JWT HS256
feat(api): itinerario + incidentes viajero (GET/POST)
feat(api): cola admin + PUT prioridad/estado + respuestas
feat(app-shared): theme + api client SecureStore
feat(app1): login/registro/itinerario
feat(app1): crear incidente + ver respuestas
feat(app2): login + cola + detalle gestion
fix: bloquear viajero en /admin (403) + validar reserva propia
feat(docker): compose php+mysql opcional con volumen
test: script api + checklist roles/seguridad
fix: validaciones + manejo 401/expirado en apps
refactor: sanitizar errores + CORS + env
docs: README + API reference
```

Nunca un commit gigante; cada feat verificable.

---

## 15. Estrategia de testing

- Manual por rol: viajero A crea incidente → agente lo ve primero si más antiguo → cambia a Crítica/EnGestion → responde → viajero lee → agente cierra → viajero ve Resuelto.
- Negativos: login mal (401), viajero GET /admin (403), POST sin token (401), SQLi `' OR '1'='1` en login/email (debe fallar seguro), JWT manipulado/expirado (401), reserva ajena (403/404), enums inválidos (400).
- Stack: `test-api.ps1` con Invoke-RestMethod + checklist Expo Go en Android/iOS. Sin librerías de test en v1 (mantener simple); PHPUnit solo si sobra tiempo (justificar).

## 16. Revisión cruzada

Toda F2-F6 la revisa un modelo distinto al autor (ver matriz). Checklist §"Criterios de calidad" del prompt (¿cumple docs? ¿funciona? ¿mantenible? ¿HCI? ¿seguridad? ¿sin duplicación? ¿sin deps innecesarias?). Hallazgo crítico bloquea merge a siguiente fase.

---

## 17. Riesgos técnicos

- Confundir contexto negocio con requisitos → mitigado por §2/§3.
- Escalada roles (auto-registro agente) → mitigado con seed + register solo viajero.
- JWT secreto débil/fuga → env + longitud + revisión.
- Guardar token inseguro → SecureStore obligatorio.
- N+1 / cola sin paginar → paginación + índices.
- Docker que complique (Expo no necesita Docker) → Docker solo para PHP+MySQL, opcional.
- Alcance (reservas editables, chat realtime) → explícitamente fuera v1.

## 18. Decisiones arquitectónicas

1. PHP puro POO+PDO sin Laravel/Symfony: respeta "sin frameworks innecesarios", cubre lo evaluado en [PREG] (clases, encapsulamiento, PDO) y es desplegable en cualquier hosting. Costo: router manual mínimo.
2. JWT HS256 implementado con `hash_hmac` (sin `firebase/php-jwt`) en v1: evita dependencia externa (prompt §3 exige justificar). Si auditoría exige, migrar a librería con Composer + justificar.
3. MySQL + volumen Docker para persistencia (responde [PREG-09]); sin ORM.
4. Dos apps Expo separadas (no una con switch rol): refleja borrador (dos APK) y aísla permisos; comparten `shared/`.
5. Sin refresh-token en v1: simplicidad; re-login a las 8h. Documentado para v2.

## 19. Preguntas / ambigüedades para el docente

1. ¿Registro de agentes es abierto o por alta interna? Asumimos seed/admin.
2. ¿Estados intermedios permitidos o solo Abierto/Resuelto? Asumimos tríada con EnGestion.
3. ¿Prioridad inicial siempre Baja o el viajero sugiere? Asumimos Baja y agente ajusta.
4. ¿Respuesta es un solo mensaje o hilo? Asumimos hilo (`respuestas` 1:N).
5. ¿Itinerario es solo lectura seed o hay alta de reservas? Asumimos lectura.
6. ¿Expiración JWT y refresh requeridos? Asumimos 8h sin refresh.
7. ¿Docker es obligatorio entregar o basta opcional? Asumimos opcional con Compose que demuestra imagen/volumen/red.

---

## 20. Criterio de "fase terminada" (checklist rápido)

¿Cumple borrador? ¿Funciona demo? ¿Arquitectura coherente? ¿Mantenible? ¿Intuitiva+HCI? ¿bcrypt+JWT+roles+PDO? ¿Validaciones? ¿Sin duplicación ni deps de más? ¿Sin secretos expuestos? Si algo falla → fix antes de avanzar.

*Fin del plan. Próximo paso tras aprobación: F1 (schema + esqueleto + theme). Sin aprobación, no crear código.*
