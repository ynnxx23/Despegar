# App 2 — Centro de Resolución (agente)

> Alcance: solo app agente (`apps/agente/` + `apps/shared/`).
> Visión general en `../DOC_PROYECTO.md`. API en `api.md`. App viajero en `app-viajero.md`.

## 1. Qué es

App móvil del empleado de soporte: atiende la cola ordenada por urgencia (SLA), busca y
filtra, toma/deriva/sigue casos, usa IA (triage + copiloto), deja notas internas, responde
y cierra con trazabilidad y auditoría. Sin registro público: altas por el equipo
(`POST /admin/agentes`).

## 2. Stack y estructura

- Expo SDK 57, React Native 0.86, React 19.2, JavaScript. Sin React Navigation ni Axios.
- `expo-secure-store` 57.x: guarda token + refresh (nunca en plano).
- Paquete: `despegar-agente` (`apps/agente/package.json`), entry `expo/AppEntry` → `App.js`.

```
apps/agente/
  App.js                    # sesión + cola/detalle/avisos + header con campana
  app.json                  # slug despegar-agente, package com.despegar.agente
  metro.config.js           # watchFolders ../shared
  screens/
    LoginScreen.js          # corporativo (rechaza no-agente) + recupero
    ColaScreen.js           # buscador, tabs, filtros, orden, panel métricas, paginación
    DetalleGestionScreen.js # claim/release/derivar/seguir, triaje, IA+copiloto,
                            # responder (pública/interna), historial con hash
apps/shared/                # ver app-viajero.md (theme EVA, api+refresh, etc.)
```

Campana 🔔 en header alterna Cola/Avisos con conteo de no leídas.

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

Puerto 8082 (viajero usa 8081). `--clear` ante bundle corrupto; `EADDRINUSE` = otro Metro.

Credencial demo: `agente@despegar.com` / `Agente123`.

## 4. Pantallas y flujos

| Pantalla | Origen | Qué hace |
|---|---|---|
| Login | `LoginScreen.js` | corporativo; rechaza no-agente; sin registro; recupero |
| Cola | `ColaScreen.js` | `GET /admin/incidentes?q=&tipo=&estado=&prioridad=&orden=&page=` (urgencia: vencidos SLA, sin triar, Crítica/Alta/Baja) + `/resumen` + `/metricas` + `/sla/riesgo`; tabs Activos/Sin triar/Míos/Resueltos; claim directo |
| Gestión | `DetalleGestionScreen.js` | `GET /admin/incidentes/:id`; `POST claim/release/derivar/seguir`; `PUT` prioridad/estado (transición válida, Resuelto exige prioridad); `GET :id/ia` (score), `POST :id/copiloto` (rellena); `POST :id/respuestas` (interna opcional); historial con hash |
| Avisos | `NotificacionesScreen.js` | `GET /notificaciones`, leer una/todas |

Flujo feliz: login → cola (urgentes primero) → buscar/filtrar → abrir → reclamar →
sugerencia IA → copiloto → responder → Resuelto (confirmar). 401 con refresh → renueva.

## 5. Permisos y errores visibles

- Solo rol `agente`. Transición inválida o Resuelto sin prioridad → 400 con detalle.
- Claim de caso ajeno → 409. Mensajes UI por situación, sin datos sensibles en logs.

## 6. Checklist manual (Expo Go, misma Wi-Fi)

1. Login corporativo / rechazo a viajero / recupero.
2. Cola: buscador, filtros, orden urgencia, panel MTTR/riesgo, paginación.
3. Claim + tomar/derivar/seguir un caso.
4. Sugerencia IA + copiloto + respuesta pública e interna.
5. PUT con transición inválida (muestra error) y cierre Resuelto.
6. Historial con hash + auditoría. Avisos campana.
