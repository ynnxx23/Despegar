# Documentación del Proyecto — Despegar (Grupo 8: Gestión de Incidentes Críticos)

> Documento general. Describe QUÉ es el proyecto y PARA QUÉ sirve, sin tecnicismos.
> Detalle técnico en `DOC_DESARROLLO.md`. Planificación original en `PLAN_DESARROLLO_DESPEGAR.md`.

## 1. Presentación

Despegar es una agencia de viajes online de origen argentino que opera en toda América Latina
(vuelos, hoteles, paquetes, autos y seguros). Por su volumen de reservas necesita un canal ágil
para resolver los problemas de los viajeros: vuelos cancelados, hoteles que no reconocen una
reserva o cobros indebidos.

Este proyecto (Grupo 8) construye ese canal: un **ecosistema de gestión de incidentes críticos**
con **dos aplicaciones móviles** conectadas a un mismo sistema central.

## 2. Problema y solución

**Problema:** cuando un viajero queda varado o detecta un fraude, su reclamo se pierde entre
canales genéricos: no hay registro único, ni prioridad, ni seguimiento visible.

**Solución:** el viajero reporta el incidente desde su celular y sigue la respuesta en el mismo
lugar; el agente de soporte atiende una cola ordenada por fecha, prioriza los casos críticos,
responde y cierra cada caso dejando trazabilidad completa.

## 3. Objetivos

- Dar al viajero un canal simple para reportar problemas y ver su solución.
- Dar al agente una cola ordenada con prioridades y estados claros.
- Garantizar que cada usuario solo vea y toque lo que le corresponde (viajero vs. agente).
- Proteger las cuentas con contraseñas cifradas y accesos por token.
- Mantener una interfaz con la identidad visual de Despegar: cercana, simple y violeta.

## 4. Alcance

**Incluye:** registro e inicio de sesión, itinerario de viajes, reporte de incidentes, respuestas
de soporte, cola de atención con prioridades (Baja, Alta, Crítica) y estados
(Abierto, En gestión, Resuelto), y reportes de conteo para el panel del agente.

**No incluye (a propósito):** comprar viajes, pagos, chat en tiempo real, programa de puntos,
ni panel de agencias. Son temas de la empresa real, no de este recorte del proyecto.

## 5. Usuarios y roles

| Usuario | Quién es | Qué puede hacer |
|---|---|---|
| Viajero | Cliente que compró un viaje | Ver su itinerario, reportar incidentes, leer las respuestas |
| Agente | Empleado de atención al cliente | Ver todos los incidentes, priorizar, responder y resolver |

Las cuentas de agente las crea el equipo (no hay registro público de agentes).

## 6. Las dos aplicaciones

**App 1 — Portal de Ayuda al Viajero.** Pantallas: inicio de sesión, crear cuenta, Mis viajes,
Reportar problema, Mis incidentes y detalle con las respuestas de soporte.

**App 2 — Centro de Resolución (agentes).** Pantallas: inicio de sesión corporativo, cola de
incidentes con filtros (estado, prioridad, orden por fecha) y resumen de conteos, y pantalla de
gestión para cambiar prioridad/estado, responder al viajero y marcar Resuelto (con confirmación).

Ambas comparten el mismo sistema central y la misma base de datos, pero cada una muestra solo
lo suyo.

## 7. Flujos principales

**Viajero varado:** inicia sesión, abre Mis viajes, toca Reportar, elige el tipo de problema y
la reserva, confirma el envío, recibe su número de reporte y luego lee la respuesta del agente
hasta que el caso figura Resuelto.

**Agente:** inicia sesión, abre la cola (casos viejos primero), filtra por críticos, abre un
caso, responde al viajero, ajusta la prioridad y lo marca Resuelto cuando la aerolínea u hotel
confirma la solución.

## 8. Cómo funciona por dentro (resumen)

```
Celular viajero ─┐
                 ├─→ Sistema central (API) ─→ Base de datos PostgreSQL
Celular agente ──┘        (verifica quién sos y qué rol tenés en cada pedido)
```

Todo viaja como mensajes JSON; el celular guarda un token seguro que demuestra la identidad en
cada pedido, sin sesiones en el servidor.

## 9. Datos que maneja

Personas (cuentas y roles), reservas/itinerario (vuelos y hoteles), incidentes (tipo, título,
descripción, prioridad, estado) y respuestas (hilo de mensajes por incidente).

## 10. Identidad visual y experiencia

Interfaz propia inspirada en Despegar: violeta como color principal, tarjetas blancas
redondeadas, botones grandes fáciles de tocar, textos claros en español rioplatense y mensajes
comprensibles en cada situación (cargando, vacío, error, éxito, confirmaciones).

## 11. Seguridad (resumen)

Contraseñas cifradas irreversibles (nunca se guardan legibles), accesos con token firmado que
expira y se renueva solo con un refresh token, permisos por rol verificados en cada pedido
(incluso contra la base, no solo contra el token) y validación de todos los datos que se
ingresan. Los secretos viven fuera del repo (`.env` ignorado por git) y los que estuvieron
publicados se rotaron.

## 12. Cómo probarlo (resumen)

Opción rápida (la que usan las apps ahora): la API ya está desplegada en Railway, así que no
hace falta levantar nada en la PC.

1. Instalar dependencias e iniciar cada app: doble clic en `start-viajero.cmd` y
   `start-agente.cmd` (la URL de la API sale de `deploy/api-url.txt`).
2. Abrir con Expo Go en el celular (cualquier red: la API responde por HTTPS público).
3. Entrar como `ana@test.com` / `Viaje1234` (viajero) y `agente@despegar.com` / `Agente123`
   (agente). Las credenciales demo están en el repo, no en la app.
4. Reportar un caso en una app y resolverlo en la otra (el agente puede **reclamar** el caso
   y **seguir** los que le interesen).

Opción local: levantar la base PostgreSQL y el sistema (`psql -f db/schema.sql -f db/seeds.sql`,
`php -S 0.0.0.0:8000 -t backend/public`) y arrancar las apps con `start-*.cmd local`.

Instrucciones exactas en `README.md` y detalle de pruebas en `DOC_DESARROLLO.md`.

## 13. Estado y pendientes manuales

Sistema, base de datos y pruebas automáticas: verificados funcionando. Pendiente solo lo que
requiere interacción: instalación en celular vía Expo Go, demo en vivo y levantada de Docker
(detalles en `README.md`).

## 14. Glosario mínimo

Incidente (reporte de un problema), cola (lista ordenada de casos por atender), prioridad
(urgencia: Baja/Alta/Crítica), estado (etapa: Abierto/En gestión/Resuelto), token (pase digital
que identifica la sesión), API (el sistema central que atiende pedidos de las apps).
