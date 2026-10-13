# App 1 — Portal de Ayuda al Viajero

> Alcance: solo app viajero (`apps/viajero/` + `apps/shared/`).
> Visión general en `../DOC_PROYECTO.md`. API en `api.md`. App agente en `app-agente.md`.

## 1. Qué es

App móvil del cliente: ve su itinerario, reporta problemas (offline incluido), agrega
información y comprobantes, sigue las respuestas de soporte y puede reabrir si no se
resolvió. Cada viajero solo ve lo suyo (filtrado por `user_id` + ownership con 403).

## 2. Stack y estructura

- Expo SDK 57, React Native 0.86, React 19.2, JavaScript. Sin React Navigation ni Axios.
- `expo-secure-store` 57.x: guarda token + refresh (nunca en plano).
- Paquete: `despegar-viajero` (`apps/viajero/package.json`), entry `expo/AppEntry` → `App.js`.

```
apps/viajero/
  App.js                    # sesión (me + refresh auto) + tabs + detalle apilado + logo
  app.json                  # slug despegar-viajero, package com.despegar.viajero
  metro.config.js           # watchFolders ../shared
  screens/
    LoginScreen.js          # login + recupero (PasswordReset)
    RegisterScreen.js       # alta viajero (solo rol viajero)
    ItinerarioScreen.js      # Mis viajes (pull-refresh, vacío, reintentar, reportar)
    NuevoIncidenteScreen.js  # Reportar (offline queue + idempotencia, confirmación, n°)
    MisIncidentesScreen.js  # lista (filtros, búsqueda, badges) + Detalle (hilo, réplica,
                            # adjuntos+OCR, reabrir)
    AyudaScreen.js          # FAQ + asistente (chatbot borrador)
    PerfilScreen.js         # cuenta, verificación email, sesiones, borrado GDPR
apps/shared/                # común a ambas apps
  theme.js                  # tokens EVA reales: #4300D2, pill 24, cards 8, header blanco
  api.js                    # fetch + Bearer + refresh auto en 401 + onUnauthorized
  auth.js                   # SecureStore (token/refresh/user/offline_queue)
  components.js             # Button/Input/Banner/Badge/Empty/Loading + Logo/Screen/Card/Chip
  format.js / constants.js  # etiquetas es-AR, fechas, tipos/SLA únicos
  offlineQueue.js           # cola reportes sin red (reintento idempotente)
  notificaciones.js         # polling no-leídas 30s
  NotificacionesScreen.js   # Avisos (leer una/todas)
  PasswordReset.js          # recupero en 2 pasos
```

Navegación condicional por estado (sin librería): `login/register` → tabs
(Viajes/Reportar/Incidentes/Avisos/Ayuda/Perfil) → detalle apilado (oculta tabs).
`BASE_URL` vía `EXPO_PUBLIC_API_URL` en `apps/viajero/.env` (IP LAN para Expo Go,
`10.0.2.2` en emulador Android, localhost solo web).

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

Puerto 8081 (agente usa 8082). Ante bundle corrupto: `npx expo start --clear --port 8081`.
Si `EADDRINUSE`: otro Metro en 8081 — cerrar terminal sobrante.
Si `main has not been registered`: Metro en carpeta errónea o caché vieja — `--clear`.

Credencial demo: `ana@test.com` / `Viaje1234` (otra: `bruno@test.com` / `Viaje5678`).

## 4. Pantallas y flujos

| Pantalla | Origen | Qué hace |
|---|---|---|
| Login | `LoginScreen.js` | email+password → guarda par token/refresh; link recupero |
| Registro | `RegisterScreen.js` | alta viajero → 201 + par de sesión |
| Viajes | `ItinerarioScreen.js` | `GET /itinerario`, pull-refresh, acceso directo a Reportar |
| Reportar | `NuevoIncidenteScreen.js` | `POST /incidentes` + `idempotencia_key`; sin red → cola offline |
| Incidentes | `MisIncidentesScreen.js` | `GET /incidentes/mios?estado=&q=`, filtros, badges |
| Detalle | Detalle embebido en MisIncidentes | detalle + historial público + hilo; réplica (reabre), adjuntos + OCR, reabrir |
| Avisos | `NotificacionesScreen.js` | `GET /notificaciones`, leer una/todas |
| Ayuda | `AyudaScreen.js` | FAQ + `POST /chatbot/borrador` (tipo/título/faltantes) |
| Perfil | `PerfilScreen.js` | verificación email, cerrar sesión/todas, `DELETE /me` (GDPR) |

Flujo feliz: login → Viajes → Reportar (confirma `Alert`) → n° reporte → Detalle →
respuesta del agente → estado Resuelto (o reabrir). 401 con refresh válido → renueva solo;
sin refresh → logout automático.

## 5. Permisos y errores visibles

- Solo endpoints rol `viajero` (+ ownership). Recurso ajeno → 403. Notas internas invisibles.
- Mensajes UI por situación: cargando, vacío, error con reintentar, éxito, confirmaciones.
- Sin `console.log` con datos sensibles. Español rioplatense, sin emojis.

## 6. Checklist manual (Expo Go, misma Wi-Fi)

1. Login/logout + persistencia + recupero.
2. Viajes con pull-refresh.
3. Crear incidente (online y modo avión → cola → sincroniza sin duplicar).
4. Filtros + búsqueda en Mis incidentes.
5. Detalle: réplica, adjunto + OCR, reabrir un Resuelto.
6. Avisos: leer una/todas. Ayuda: borrador del asistente.
7. Perfil: verificar email, cerrar en todos lados, eliminar cuenta.
