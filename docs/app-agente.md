# App 2 — Centro de Resolución (agente)

> Alcance: solo app agente (`apps/agente/` + `apps/shared/`).
> Visión general en `../DOC_PROYECTO.md`. API en `api.md`. App viajero en `app-viajero.md`.

## 1. Qué es

App móvil del empleado de soporte: atiende la cola de incidentes ordenada por fecha,
filtra por estado/prioridad, ve resumen de conteos, cambia prioridad/estado,
responde al viajero y cierra casos con trazabilidad. Sin registro público:
las cuentas `agente` las crea el equipo.

## 2. Stack y estructura

- Expo SDK 57, React Native 0.86, React 19.2, JavaScript. Sin React Navigation ni Axios.
- `expo-secure-store` 57.x: guarda el JWT (nunca en plano).
- Paquete: `despegar-agente` (`apps/agente/package.json`), entry `App.js`.

```
apps/agente/
  App.js                    # sesión corporativa + cola + gestión
  app.json                  # slug despegar-agente, package com.despegar.agente
  metro.config.js           # watchFolders ../shared, nodeModulesPaths local
  screens/
    LoginScreen.js          # login corporativo (rechaza no-agente, sin registro)
    ColaScreen.js           # cola: resumen, filtros, orden asc/desc, paginación, highlight Crítica
    DetalleGestionScreen.js # gestión: PUT prioridad/estado (Resuelto confirma), responder, hilo
apps/shared/                # común a ambas apps (único código compartido)
  theme.js                  # violeta #6C2BD9/#4A1FA3, fondo #F6F5FB, semántica prioridad/estado
  api.js                    # fetch + Bearer automático + onUnauthorized->logout en 401
  auth.js                   # SecureStore (adaptador memoria testeable)
  components.js             # Button/Input/Banner/Badge/Empty/Loading
  format.js                 # etiquetas legibles, fechas es-AR
```

`BASE_URL` en `apps/shared/api.js`: IP LAN de la PC para Expo Go
(`http://<IP>:8000/api`), `10.0.2.2` en emulador Android, localhost solo web.

## 3. Puesta en marcha

```cmd
REM desde la raíz del repo (doble clic):
start-agente.cmd
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

Credencial demo: `agente@despegar.com` / `Agente123`.

## 4. Pantallas y flujos

| Pantalla | Origen | Qué hace |
|---|---|---|
| Login | `screens/LoginScreen.js` | corporativo; rechaza cuentas no-agente; sin link de registro |
| Cola | `screens/ColaScreen.js` | `GET /admin/incidentes` (filtros estado/prioridad, orden fecha, paginación `page/limit`) + `GET /admin/incidentes/resumen` (conteos `resumen_cola()`), highlight Crítica |
| Gestión | `screens/DetalleGestionScreen.js` | `GET /admin/incidentes/:id`, `PUT` prioridad/estado (Resuelto pide confirmación), `GET/POST /admin/incidentes/:id/respuestas` (responder pasa a EnGestion vía `crear_respuesta()`) |

Flujo feliz: login → cola (viejos primero) → filtrar críticos → abrir caso →
responder al viajero → ajustar prioridad → marcar Resuelto (confirmar) →
verificar en resumen. 401 (expirado/inválido) → logout automático.

## 5. Permisos y errores visibles

- Solo endpoints rol `agente`. Viajero en rutas `/admin` → 403.
- PUT parcial valida valores cerrados (prioridad/estado) → 400 si inválido.
- Mensajes UI por situación: cargando, vacío, error con reintentar, éxito, confirmaciones.
- Sin `console.log` con datos sensibles.

## 6. Checklist manual (Expo Go, misma Wi-Fi)

1. Login corporativo / rechazo a cuenta viajero.
2. Cola con resumen de conteos.
3. Filtros estado/prioridad + orden asc/desc + paginación.
4. PUT prioridad/estado (Resuelto con confirmación).
5. Responder y verificar hilo cruzado en app viajero.
6. Sesión persistente al recargar; logout limpia todo.
