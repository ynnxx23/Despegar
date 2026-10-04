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
- Paquete: `despegar-viajero` (`apps/viajero/package.json`), entry `App.js`.

```
apps/viajero/
  App.js                    # sesión + tabs (Viajes/Reportar/Incidentes) + detalle apilado
  app.json                  # slug despegar-viajero, package com.despegar.viajero
  metro.config.js           # watchFolders ../shared, nodeModulesPaths local
  screens/
    LoginScreen.js          # inicio de sesión
    RegisterScreen.js       # crear cuenta (solo rol viajero)
    ItinerarioScreen.js     # Mis viajes (pull-refresh, vacío, reintentar)
    NuevoIncidenteScreen.js # Reportar (tipo+reserva opcional, confirmación, n° éxito)
    MisIncidentesScreen.js  # Mis incidentes (filtros, badges) + DetalleIncidenteScreen (hilo)
apps/shared/                # común a ambas apps (único código compartido)
  theme.js                  # violeta #6C2BD9/#4A1FA3, fondo #F6F5FB, spacing 8, radius 12/16, táctil 48
  api.js                    # fetch + Bearer automático + onUnauthorized->logout en 401
  auth.js                   # SecureStore (adaptador memoria testeable)
  components.js             # Button/Input/Banner/Badge/Empty/Loading
  format.js                 # etiquetas legibles, fechas es-AR
```

Navegación condicional por estado (sin librería): `login/register` → tabs →
detalle apilado. `BASE_URL` en `apps/shared/api.js`: IP LAN de la PC para Expo Go
en celular (`http://<IP>:8000/api`), `10.0.2.2` en emulador Android, localhost solo web.

## 3. Puesta en marcha

```cmd
REM desde la raíz del repo (doble clic):
start-viajero.cmd
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

Credencial demo: `ana@test.com` / `Viaje1234` (otra: `bruno@test.com` / `Viaje5678`).

## 4. Pantallas y flujos

| Pantalla | Origen | Qué hace |
|---|---|---|
| Login | `screens/LoginScreen.js` | email+password → guarda token, entra a tabs |
| Registro | `screens/RegisterScreen.js` | alta viajero (nombre 2-100, password 8-72) → 201 + token |
| Viajes | `screens/ItinerarioScreen.js` | `GET /itinerario`, pull-refresh, vacío, reintentar |
| Reportar | `screens/NuevoIncidenteScreen.js` | `POST /incidentes` (tipo, título 5-120, desc 10-2000, reserva propia opcional) → n° reporte |
| Incidentes | `screens/MisIncidentesScreen.js` | `GET /incidentes/mios?estado=`, filtros, badges |
| Detalle | `DetalleIncidenteScreen` (mismo archivo) | `GET /incidentes/:id` + `/respuestas`, hilo solo lectura |

Flujo feliz: login → Viajes → Reportar (elige tipo+reserva, confirma `Alert`) →
n° reporte → Incidentes → Detalle → lee respuesta del agente → estado Resuelto.
Header con Salir (limpia SecureStore + memoria). 401 (expirado/inválido) → logout automático.

## 5. Permisos y errores visibles

- Solo endpoints rol `viajero` (+ detalle propio). Recurso ajeno → 403.
- Mensajes UI por situación: cargando, vacío, error con reintentar, éxito, confirmaciones.
- Sin `console.log` con datos sensibles. Textos en español rioplatense, sin emojis.

## 6. Checklist manual (Expo Go, misma Wi-Fi)

1. Login/logout con `ana@test.com`.
2. Viajes con pull-refresh.
3. Crear incidente con confirmación y n° éxito.
4. Filtrar Mis incidentes.
5. Abrir detalle y leer hilo respondido por el agente.
6. Sesión persistente al recargar; logout limpia todo.
