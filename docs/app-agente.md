# App 2 — Centro de Resolución (agente y admin)

> Alcance: solo app agente (`apps/agente/` + `apps/shared/`).
> Visión general en `../DOC_PROYECTO.md`. API en `api.md`. App viajero en `app-viajero.md`.

## 1. Qué es

App móvil del empleado de soporte: atiende la cola de incidentes ordenada por fecha,
filtra por estado/prioridad, ve resumen de conteos, cambia prioridad/estado,
responde al viajero y cierra casos con trazabilidad. Sin registro público:
las cuentas `agente` las crea un **administrador** desde el panel de la misma app.

Dentro de la app conviven dos roles:
- `agente`: atiende la cola de casos.
- `admin`: además de la cola, ve la pestaña **Administrar** para dar de alta agentes,
  cambiar roles, activar/desactivar cuentas y auditar los cambios.

## 2. Stack y estructura

- Expo SDK 57, React Native 0.86, React 19.2, JavaScript. Sin React Navigation ni Axios.
- `expo-secure-store` 57.x: guarda el JWT (nunca en plano).
- Paquete: `despegar-agente` (`apps/agente/package.json`), entry `expo/AppEntry` → `App.js` (el shim registra el componente raíz; sin él sale `main has not been registered`).

```
apps/agente/
  App.js                    # sesión corporativa + cola + gestión + panel de administración
  app.json                  # slug despegar-agente, package com.despegar.agente
  metro.config.js           # watchFolders ../shared, nodeModulesPaths local
  components/
    estilosGestion.js       # hoja de estilos de la gestión (compartida con los paneles)
    panelesGestion.js       # ResumenCaso, PanelAccion, PanelViajero, PanelTriaje,
                            #   PanelRespuesta, PanelHistorial
  screens/
    LoginScreen.js          # wrapper del login compartido (rechaza no-agente/admin)
    ColaScreen.js           # cola: pestañas, resumen, filtros, orden, paginación
    DetalleGestionScreen.js # caso: hook useCaso + acciones (reclamar, seguir, derivar, responder)
    AdminUsuariosScreen.js  # panel de administración de usuarios (solo rol admin)
apps/shared/                # común a ambas apps (único código compartido)
  theme.js                  # violeta #6C2BD9/#4A1FA3, fondo #F6F5FB, semántica prioridad/estado
  api.js                    # fetch + Bearer automático + timeout 8s + refresh ante 401
                            #   (reintenta la petición) + onUnauthorized->logout si el refresh falla
  auth.js                   # SecureStore (adaptador memoria testeable): access + refresh token
  session.js                # useSession: arranque de sesion (no cierra la sesion por error de red)
  hooks.js                  # useApiList: carga + refresco + error de las listas
  LoginScreen.js            # login compartido por las dos apps
  components.js             # Button/Input/Banner/Badge/Empty/Loading/Chip/FormScrollView
  format.js                 # etiquetas legibles, estados, prioridades, fechas es-AR
```

La URL de la API sale de `EXPO_PUBLIC_API_URL`, que Expo incrusta al compilar el bundle:
la escriben los `.cmd` de arranque desde `deploy/api-url.txt` (nube) o desde la IP LAN
detectada (`start-agente.cmd local`). `10.0.2.2` en emulador Android, localhost solo web.

## 3. Puesta en marcha

```cmd
REM desde la raíz del repo (doble clic):
start-agente.cmd              -> API en la nube (deploy/api-url.txt)
start-agente.cmd local        -> backend local en http://<IP-LAN>:8000/api
```

Equivalente manual:

```cmd
cd apps\agente
npm install
npx expo start --port 8082
```

Puerto 8082 por defecto (viajero usa 8081 para correr en simultáneo).
Ante bundle corrupto: `npx expo start --clear --port 8082`.
Si `EADDRINUSE`: otro Metro ocupa el puerto — cerrar terminal sobrante.
Si `main has not been registered`: Metro en carpeta errónea o caché vieja —
detener todo, arrancar desde `apps\agente`, `--clear`.

Credenciales demo (la app **no** las muestra): ver `datos.md` en la raiz del repo.
Administradores: `admin@despegar.com` / `Admin1234` y `admin2@despegar.com` / `Admin5678`.

## 4. Pantallas y flujos

| Pantalla | Origen | Qué hace |
|---|---|---|
| Login | `screens/LoginScreen.js` | corporativo; rechaza cuentas no-agente; sin link de registro; estado "Conectando…/Conectado" |
| Cola | `screens/ColaScreen.js` | pestañas **Activos / Sin triar / Míos / Siguiendo / Resueltos**, resumen con conteos, filtros tipo/prioridad, orden, paginación; cards con "Reclamado por X", "Lo tenés vos", "Siguiendo" y botones Reclamar / Seguir |
| Administración | `screens/AdminUsuariosScreen.js` | Solo rol `admin`. Lista usuarios (búsqueda + filtro por rol), **registra un agente nuevo**, cambia el rol de alguien ya registrado, activa/desactiva, resetea la contraseña y muestra el **historial de cambios** (actor, valor anterior → nuevo, motivo) |
| Gestión | `screens/DetalleGestionScreen.js` + `components/panelesGestion.js` | `GET /admin/incidentes/:id`, `POST .../claim` (reclamar), `POST/DELETE .../seguir` (seguir/dejar de seguir), `POST .../release`, `POST .../derivar`, `PUT` prioridad/estado (Resuelto pide confirmación), `GET/POST .../respuestas` (responder pasa a EnGestion vía `crear_respuesta()`) |

Flujo feliz: login → cola (urgentes primero) → filtrar críticos → abrir caso →
reclamar (aparece en **Míos**) → responder al viajero → ajustar prioridad →
marcar Resuelto (confirmar) → verificar en resumen. 401 (expirado/inválido) → la app renueva
la sesión sola con el refresh token y reintenta; si el refresh tampoco sirve, logout automático.
Si falta `EXPO_PUBLIC_API_URL`, el login muestra un aviso: la app quedó apuntando a
`localhost`, que no funciona desde un celular.

**Reclamar y seguir**:
- *Reclamar* asigna el caso al agente (`asignado_a`), lo pasa a EnGestion y lo marca en la
  pestaña **Míos**. Si otro agente lo tenía, la API responde 409.
- *Seguir* es libre: cualquier agente puede seguir un caso, tenga o no el caso asignado.
  Los casos que sigo y no son míos aparecen en la pestaña **Siguiendo**.
- El detalle muestra quién lo reclamó, quiénes lo siguen y permite derivarlo a otro agente.

## 5. Permisos y errores visibles

- Endpoints de casos: rol `agente` o `admin`. Viajero en rutas `/admin` → 403.
- Endpoints de administración (`/admin/usuarios`, `/admin/historial`): **solo rol `admin`**;
  un agente recibe 403. La API revalida el rol contra la BD en cada request, así que
  degradar una cuenta a `agente` le oculta el panel en la próxima petición.
- PUT parcial valida valores cerrados (prioridad/estado) → 400 si inválido.
- Mensajes UI por situación: cargando, vacío, error con reintentar, éxito, confirmaciones.
- El cliente HTTP corta cada request a los 8 s: si la API no responde, la UI lo dice en vez
  de quedar colgada. Los mensajes no exponen la URL del servidor.
- Sin `console.log` con datos sensibles.

## 6. Checklist manual (Expo Go)

1. Login corporativo / rechazo a cuenta viajero.
2. Cola con resumen de conteos.
3. Filtros tipo/prioridad + orden asc/desc + paginación.
4. Reclamar un caso → aparece en **Míos** con "Reclamado por <agente>".
5. Seguir un caso (propio o de otro) → aparece en **Siguiendo**; dejar de seguir lo saca.
6. PUT prioridad/estado (Resuelto con confirmación).
7. Responder y verificar hilo cruzado en app viajero.
8. Sesión persistente al recargar; logout limpia todo.
9. Con un admin: pestaña **Administrar** → registrar un agente nuevo, promover a agente a
   un viajero ya registrado, activar/desactivar, resetear contraseña y ver el historial.
