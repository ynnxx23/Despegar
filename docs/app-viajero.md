# App 1 — Portal de Ayuda al Viajero

> Alcance: solo app viajero (`apps/viajero/` + `apps/shared/`).
> Visión general en `../DOC_PROYECTO.md`. API en `api.md`. App agente en `app-agente.md`.

## 1. Qué es

App móvil del cliente: ve su itinerario, reporta problemas y sigue las respuestas
de soporte hasta que el caso figura Resuelto. Cada viajero solo ve lo suyo
(filtrado por `user_id` en API + ownership con 403).

## 2. Stack y estructura

- Expo SDK 57, React Native 0.86, React 19.2, JavaScript. Sin React Navigation ni Axios.
- `expo-secure-store` 57.x: guarda el JWT (nunca en plano).
- Paquete: `despegar-viajero` (`apps/viajero/package.json`), entry `expo/AppEntry` → `App.js` (el shim registra el componente raíz; sin él sale `main has not been registered`).

```
apps/viajero/
  App.js                    # sesión + tabs (Viajes/Reportar/Incidentes/Ayuda/Perfil) + detalle apilado
  app.json                  # slug despegar-viajero, package com.despegar.viajero
  metro.config.js           # watchFolders ../shared, nodeModulesPaths local
  screens/
    LoginScreen.js          # inicio de sesión (estado Conectando…/Conectado)
    RegisterScreen.js       # crear cuenta (solo rol viajero)
    ItinerarioScreen.js     # Mis viajes (pull-refresh, vacío, reintentar)
    NuevoIncidenteScreen.js # Reportar (tipo+reserva opcional, confirmación, n° éxito)
    MisIncidentesScreen.js  # Mis incidentes (filtros, badges)
    DetalleIncidenteScreen.js # detalle: estado, novedades y respuestas de soporte
    AyudaScreen.js          # preguntas frecuentes + estado del servicio
    PerfilScreen.js         # datos de cuenta y cierre de sesión
apps/shared/                # común a ambas apps (único código compartido)
  theme.js                  # violeta #6C2BD9/#4A1FA3, fondo #F6F5FB, spacing 8, radius 12/16, táctil 48
  api.js                    # fetch + Bearer automático + timeout 8s + refresh ante 401
                            #   (reintenta la petición) + onUnauthorized->logout si el refresh falla
  auth.js                   # SecureStore (adaptador memoria testeable): access + refresh token
  components.js             # Button/Input/Banner/Badge/Empty/Loading/FormScrollView
  format.js                 # etiquetas legibles, estados, prioridades, fechas es-AR
```

Navegación condicional por estado (sin librería): `login/register` → tabs →
detalle apilado. La URL de la API sale de `EXPO_PUBLIC_API_URL`, que Expo incrusta al compilar
el bundle: la escriben los `.cmd` de arranque desde `deploy/api-url.txt` (nube) o desde la IP LAN
detectada (`start-viajero.cmd local`). `10.0.2.2` en emulador Android, localhost solo web.

## 3. Puesta en marcha

```cmd
REM desde la raíz del repo (doble clic):
start-viajero.cmd              -> API en la nube (deploy/api-url.txt)
start-viajero.cmd local        -> backend local en http://<IP-LAN>:8000/api
```

Equivalente manual:

```cmd
cd apps\viajero
npm install
npx expo start --port 8081
```

Puerto 8081 por defecto (agente usa 8082 para correr en simultáneo).
Ante bundle corrupto: `npx expo start --clear --port 8081`.
Si `EADDRINUSE`: hay otro Metro en 8081 — cerrar terminal sobrante, no cambiar código.
Si `main has not been registered`: Metro corría en carpeta errónea o caché vieja —
detener todo, arrancar desde `apps\viajero`, `--clear`.

Credenciales demo (la app **no** las muestra): `ana@test.com` / `Viaje1234`
(otra: `bruno@test.com` / `Viaje5678`).

## 4. Pantallas y flujos

| Pantalla | Origen | Qué hace |
|---|---|---|
| Login | `screens/LoginScreen.js` | email+password → guarda token, entra a tabs; estado de conexión "Conectando…/Conectado" |
| Registro | `screens/RegisterScreen.js` | alta viajero (nombre 2-100, password 8-72) → 201 + token |
| Viajes | `screens/ItinerarioScreen.js` | `GET /itinerario`, pull-refresh, vacío, reintentar |
| Reportar | `screens/NuevoIncidenteScreen.js` | `POST /incidentes` (tipo, título 5-120, desc 10-2000, reserva propia opcional) → n° reporte |
| Incidentes | `screens/MisIncidentesScreen.js` | `GET /incidentes/mios?estado=`, filtros, badges |
| Detalle | `screens/DetalleIncidenteScreen.js` | `GET /incidentes/:id` + `/respuestas`, novedades y respuestas de soporte |
| Ayuda | `screens/AyudaScreen.js` | preguntas frecuentes y estado del servicio |
| Perfil | `screens/PerfilScreen.js` | datos de cuenta, cierre de sesión con confirmación |

Flujo feliz: login → Viajes → Reportar (elige tipo+reserva, confirma `Alert`) →
n° reporte → Incidentes → Detalle → lee respuesta del agente → estado Resuelto.
Header con Salir (revoca el refresh token en la API y limpia SecureStore + memoria).
401 (expirado/inválido) → la app renueva la sesión sola con el refresh token y reintenta;
si el refresh tampoco sirve, logout automático.
Si falta `EXPO_PUBLIC_API_URL`, el login muestra un aviso: la app quedó apuntando a
`localhost`, que no funciona desde un celular.

## 5. Permisos y errores visibles

- Solo endpoints rol `viajero` (+ detalle propio). Recurso ajeno → 403.
- Mensajes UI por situación: cargando, vacío, error con reintentar, éxito, confirmaciones.
- El cliente HTTP corta cada request a los 8 s: si la API no responde, la UI lo dice en vez
  de quedar colgada. Los mensajes no exponen la URL del servidor.
- Los formularios usan `FormScrollView`: el teclado del celu nunca tapa el input enfocado.
- Sin `console.log` con datos sensibles. Textos en español rioplatense, sin emojis.

## 6. Checklist manual (Expo Go)

1. Login/logout con `ana@test.com`.
2. Viajes con pull-refresh.
3. Crear incidente con confirmación y n° éxito.
4. Filtrar Mis incidentes.
5. Abrir detalle y leer hilo respondido por el agente.
6. Escribir en un input con el teclado abierto: el input queda visible.
7. Sesión persistente al recargar; logout limpia todo.
