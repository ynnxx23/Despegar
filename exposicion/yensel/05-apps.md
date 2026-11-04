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

El requisito del enunciado era "componentes reutilizables" y "código compartido único".
Acá está todo lo que las dos apps usan:

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

**Monorepo sin workspaces:** no hay `package.json` raíz. Cada app tiene sus
`node_modules` y su `metro.config.js` con:

```js
config.watchFolders = [workspaceRoot];                    // ve ../shared
config.resolver.nodeModulesPaths = [path.resolve(projectRoot,'node_modules')];
```

Así las dos apps pueden usar **versiones distintas** de una dependencia sin romper
nada, y Metro no sube `node_modules` de la otra app.

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

El último punto es el que arreglamos: antes, **cualquier** fallo de `api.me()`
(timeout, sin red, 500) borraba la sesión del usuario y lo obligaba a loguearse de
nuevo, dejando además un refresh token vivo 30 días en el servidor. Ahora la sesión
se conserva y la app avisa "Sin conexión con el servidor" con un botón de reintento.

**Cierre de sesión:** se revoca el refresh token en el servidor (`POST /api/logout`),
se borra SecureStore y se limpia el token en memoria. La app nunca guarda el token en
AsyncStorage plano.

**401 durante el uso:** `api.js` intenta el refresh una sola vez (`reintentar: false`
en el reintento) y, si falla, dispara `onUnauthorized` → la app cierra sesión sola.

---

## 3. Cliente HTTP (`apps/shared/api.js`)

```js
const TIMEOUT_MS = 8000;
const controller = new AbortController();
setTimeout(() => controller.abort(), TIMEOUT_MS);   // sin esto el fetch queda colgado
```

- **Timeout de 8 s**: sin `AbortController`, un paquete descartado deja la UI en
  "Conectando…" para siempre. Es un bug clásico de React Native.
- **Refresh compartido**: si 5 requests reciben 401 a la vez, los 5 esperan **la
  misma** promesa de refresh (`refrescoEnCurso`) y reintentan con el token nuevo. No
  se emiten 5 refresh ni se invalidan entre sí.
- **Errores legibles**: el backend devuelve `{error:{code,message,details}}`; si la
  respuesta no es JSON (502 de un proxy), se mapea el status a un mensaje entendible
  ("El servidor tiene un problema. Probá en un momento.").
- **`err.details`** queda disponible para el detalle de validación.
- **Aviso de URL**: `API_WARNING` avisa si falta `EXPO_PUBLIC_API_URL` (la app
  apuntaría a `localhost`, que no sirve desde el celu) y también si la URL es `http://`
  contra un host que no es local (el token viajaría sin cifrar).

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

**La cola no reordena ni re-cuenta en el cliente.** Todo filtro y todo orden van al
servidor (`?estado=activos&prioridad=sin_triar&tipo=…&orden=urgencia&page=…`), y los
conteos de los chips salen de `GET /api/admin/incidentes/resumen` (global), no de la
página que estás viendo. Antes la app filtraba en memoria: la paginación mostraba
páginas vacías y los contadores mentían.

**La pestaña "Administrar" solo existe si `user.rol === 'admin'`.** No es que se
oculte visualmente: el rol llega del token y además la API revalida el rol contra la
base en cada request, así que un admin degradado pierde el panel (403) en la llamada
siguiente.

---

## 5. Navegación

**Sin React Navigation.** Elegimos pestañasBottom / stack propias con `View` +
`Pressable` + estado de React. Motivo: menos dependencias (el enunciado pide evitar
dependencias innecesarias) y control total del comportamiento de "pestañas montadas
que no se desmontan".

Truco de la app viajero: las pestañas se **montan la primera vez que se abren y nunca
se desmontan** (las inactivas se ocultan con `display: 'none'`). Así el borrador del
reporte sobrevive al cambio de pestaña; el formulario solo se reinicia después de un
envío exitoso.

---

## 6. Accesibilidad (y diseño)

- **Contraste AA**: los colores de texto sobre fondo cumplen ≥4.5:1. Los originales
  (`#F59E0B` ámbar, `#16A34A` verde, `#FF6B35` naranja) **no** cumplían (2.15:1,
  3.30:1, 2.84:1) y se reemplazaron por variantes oscuras (`#B45309`, `#15803D`,
  `#C2410C`). El texto de error usa `#B91C1C` sobre `#FDECEC` (5.6:1).
- **Targets táctiles**: mínimo 44-48 dp (`theme.touch = 48`). Los "reintentar" que
  eran `Text` con `onPress` (16 dp de alto) ahora son botones de 44 dp.
- **No depender solo del color**: cada badge lleva **texto**; el timeline dice
  "Completado / En curso / Pendiente"; los chips de tipo announce
  `accessibilityState={{selected:true}}`; los inputs tienen `accessibilityLabel`.
- **Errores anunciados**: `ErrorBanner` con `accessibilityRole="alert"` y
  `accessibilityLiveRegion="polite"`.
- **Cargando**: `accessibilityRole="progressbar"` + `accessibilityState={{busy:true}}`.
- **Teclado**: `FormScrollView` mide la altura del teclado y scrollea al input
  enfocado. En iOS el padding lo aplica `KeyboardAvoidingView` (en Android el padding)
  → **nunca se cuenta dos veces** (era un bug: el formulario saltaba de más).

---

## 7. Build y distribución

### Desarrollo (Expo Go)
```
start-viajero.cmd     # doble clic: npm install + expo start (puerto 8081)
start-agente.cmd      # puerto 8082
```
El `.cmd` escribe `EXPO_PUBLIC_API_URL` en `apps/<app>/.env` leyendo
`deploy/api-url.txt` (Railway) o detectando la IP LAN (modo `local`).

> La URL **va incrustada en el bundle** en tiempo de build: si cambia, hay que
> reiniciar Expo (recargar la app no alcanza).

### Distribución (APK standalone)
```
cd apps/viajero
eas build --profile preview --platform android
```
- EAS compila en la nube (no hace falta Android SDK ni Java en la PC).
- `eas.json` define los perfiles: `development` (dev client), `preview` (APK
  instalable a mano) y `production` (AAB para Play Store).
- Los perfiles `preview`/`production` fijan `EXPO_PUBLIC_API_URL` a la URL de
  Railway → la app instalada nunca apunta a `localhost`.
- El APK lleva el bundle JS adentro: **no necesita Metro ni la PC**.

### Instalar en el celu
Escanear el QR del build → "Instalar apps de orígenes desconocidos" → instalar.
Para iPhone, EAS genera un IPA, pero instalarlo en un dispositivo real requiere una
Mac con cuenta de Apple Developer.

### Actualizar
Un build nuevo se instala **encima** del anterior (mismo paquete y misma firma, que
EAS mantiene por proyecto) y **conserva la sesión** (el token sigue en SecureStore).

---

## 8. Limitaciones conocidas de las apps

- **Sin tests de componentes**: la lógica de las apps solo se cubre de forma
  indirecta (el bundle compila y hay un test del cliente HTTP). Lo primero que
  agregaría es un test del hook `useSession` con el mismo patrón que
  `api_client_refresh.test.mjs`.
- **Sin notificaciones push**: el usuario tiene que abrir la app para ver cambios.
  (Había un módulo de notificaciones en la copia del repo, pero no estaba integrado
  al router ni tenía tests: se eliminó por alcance.)
- **Sin modo offline real**: si no hay red, la app avisa, pero no encola acciones.
- **Sin internacionalización**: los textos están en español, hardcodeados.
