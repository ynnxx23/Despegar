# 08 — Testing y calidad

**78 checks automatizados** + un checklist manual sobre dispositivo.

| Suite | Archivo | Checks | Corre en | Qué cubre |
|---|---|---|---|---|
| F2 | `tests/api_f2_auth.ps1` | 15 | Windows (PowerShell) | Registro, duplicado, password corta, login ok/mal, SQLi, `/me` con y sin token, token manipulado, no-leak del hash, refresh, logout |
| F3 | `tests/api_f3_dominio.ps1` | 20 | Windows | Itinerario, 403 de agente en itinerario, crear incidente, reserva ajena, tipo inválido, "míos" con aislamiento de datos, detalle (dueño / ajeno / agente), cola, orden, filtros, respuesta, hilo, PUT ok/inválido/viajero, 401 |
| F7 | `tests/api_f7_integracion.ps1` | 3 | Windows | JWT expirado → 401, y el **loop completo** viajero → agente → viajero |
| F8 | `tests/api_f8_gestion.ps1` | 20 | Windows | Sugerencia de prioridad, bump por keyword, claim, atendido visible para el viajero, no-leak de prioridad, claim en conflicto (409), derivar, seguir, release, historial, resolver sin triage (400), triage con SLA, orden de urgencia, resumen, lista de agentes, dejar de seguir |
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

Si la API no está levantada, la suite **falla con el comando exacto** para
levantarla (no con un error críptico).

> **Ojo con las cuotas**: cada suite registra usuarios. Si corrés varias seguidas en
> la misma hora, el límite de altas (30/h por IP) puede frenar las pruebas. En
> `backend/.env` local subí `REGISTER_RATE_LIMIT=500` para eso.

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
- La revalidación del rol: si degradan a un agente **con su token en la mano**, la
  siguiente request es 403.

### Lo que NO está cubierto (reconozcalo si preguntan)
- **No hay tests end-to-end sobre el dispositivo**: la UI se valida con el checklist manual.
- **No hay test de concurrencia real**: el claim se cubre con el 409 secuencial; falta
  una prueba con dos clientes simultáneos.
- **No hay tests de las pantallas** (React): no hay runner de React Native Testing
  Library en el proyecto.
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

- **PHP**: `php -l` en todos los archivos (lo hace el CI). Sin formatter externo
  (no hay PHP-CS-Fixer: se mantiene el estilo del proyecto: 2 espacios, PSR-12 suave).
- **JS**: sin ESLint configurado (el proyecto no lo tenía); el chequeo real es que
  **Metro empaqueta sin errores** (`npx expo export`), que valida imports, sintaxis
  y que todos los módulos existan.
- **Verificación de imports del `shared`**: script propio que resuelve cada import
  contra los exports reales de `apps/shared/*` (0 faltantes).
