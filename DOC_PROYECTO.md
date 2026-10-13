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

- Dar al viajero un canal simple para reportar problemas, agregar información y ver su solución.
- Dar al agente una cola ordenada con prioridades, SLA y estados claros, con asignación y seguimiento.
- Garantizar que cada usuario solo vea y toque lo que le corresponde (viajero vs. agente).
- Proteger las cuentas con contraseñas cifradas, sesiones con refresh y accesos por token.
- Mantener la identidad visual real de Despegar (violeta #4300D2, botones pill, header blanco).

## 4. Alcance

**Incluye:** registro e inicio de sesión (con refresh, recupero y verificación de email),
itinerario de viajes, reporte de incidentes (con adjuntos y respuesta del viajero),
respuestas de soporte, cola de atención con prioridades (Baja, Alta, Crítica), SLA por
prioridad (4/24/72 h) y estados (Abierto, En gestión, Pendiente, Escalado, Resuelto,
Duplicado, Cerrado), asignación de casos (tomar/liberar/derivar/seguir), acciones masivas,
panel de métricas (MTTR, vencidos, por agente), notificaciones, sugerencia de prioridad por
IA, copiloto de respuestas y auditoría con hash encadenado.

**No incluye (a propósito):** comprar viajes, pagos, chat en tiempo real, programa de puntos,
ni panel de agencias. Son temas de la empresa real, no de este recorte del proyecto.

## 5. Usuarios y roles

| Usuario | Quién es | Qué puede hacer |
|---|---|---|
| Viajero | Cliente que compró un viaje | Ver su itinerario, reportar incidentes, responder con más info, adjuntar comprobantes, reabrir, verificar email, eliminar su cuenta |
| Agente | Empleado de atención al cliente | Ver todos los incidentes, tomar/derivar/seguir casos, priorizar, responder (público o interno), resolver, dar de alta a otros agentes |

Las cuentas de agente las crea el equipo desde la API (no hay registro público de agentes).

## 6. Las dos aplicaciones

**App 1 — Portal de Ayuda al Viajero.** Pantallas: inicio de sesión (con recupero),
crear cuenta, Mis viajes, Reportar problema (con borrador offline), Mis incidentes,
Avisos, Ayuda (con asistente) y Perfil; detalle con respuestas, adjuntos, réplica y reabrir.

**App 2 — Centro de Resolución (agentes).** Pantallas: inicio de sesión corporativo,
cola de incidentes con buscador, filtros (estado, prioridad, tipo) y orden (urgentes,
antiguos, recientes), panel de métricas y pantalla de gestión para tomar/derivar/seguir,
cambiar prioridad/estado (con transiciones válidas), responder con copiloto IA y marcar
Resuelto (con confirmación).

Ambas comparten el mismo sistema central y la misma base de datos, pero cada una muestra solo
lo suyo.

## 7. Flujos principales

**Viajero varado:** inicia sesión, abre Mis viajes, toca Reportar, elige el tipo de problema y
la reserva (o dicta el borrador al asistente), confirma el envío (se guarda offline si no hay
red), recibe su número de reporte, agrega comprobantes, lee la respuesta del agente, responde
con más información si hace falta y puede reabrir si no se resolvió.

**Agente:** inicia sesión, abre la cola (vencidos SLA primero), busca o filtra por críticos,
toma un caso, pide sugerencia de prioridad a la IA, responde (o deja nota interna), ajusta la
prioridad y lo marca Resuelto cuando la aerolínea u hotel confirma la solución.

## 8. Cómo funciona por dentro (resumen)

```
Celular viajero ─┐
                 ├─→ Sistema central (API) ─→ Base de datos PostgreSQL
Celular agente ──┘        (verifica quién sos y qué rol tenés en cada pedido)
```

Todo viaja como mensajes JSON; el celular guarda un token seguro que demuestra la identidad en
cada pedido y lo renueva solo con refresh (sesión de 30 días, revocable por dispositivo).

## 9. Datos que maneja

Personas (cuentas, roles y verificación), reservas/itinerario (vuelos y hoteles), incidentes
(tipo, título, descripción, prioridad sugerida y real, SLA, estado, asignación), respuestas
(hilo público y notas internas), adjuntos (fotos/PDF con OCR), notificaciones, eventos de
auditoría con hash y sesiones revocables.

## 10. Identidad visual y experiencia

Interfaz con los tokens reales del sitio Despegar (extraídos de su CSS): violeta `#4300D2`
como color principal, header blanco, botones pill de 24px, tarjetas blancas de 8px, textos
claros en español rioplatense y mensajes comprensibles en cada situación (cargando, vacío,
error, éxito, confirmaciones).

## 11. Seguridad (resumen)

Contraseñas cifradas irreversibles (nunca se guardan legibles), accesos con token firmado que
expira y se renueva con refresh revocable, cuentas desactivables y borrado de datos (GDPR),
permisos por rol verificados en cada pedido y validación de todos los datos que se
ingresan.

## 12. Cómo probarlo (resumen)

1. Levantar la base PostgreSQL y el sistema (`php backend/db_migrate.php` tras schema+seeds, `php -S 0.0.0.0:8000 -t backend/public backend/public/index.php`).
2. Instalar dependencias de cada app (`npm install`) e iniciarlas (`npx expo start`, viajero `:8081`, agente `:8082`).
3. Abrir con Expo Go en el celular (misma Wi-Fi) apuntando a la IP de la PC.
4. Entrar como `ana@test.com` / `Viaje1234` (viajero) y `agente@despegar.com` / `Agente123` (agente).
5. Reportar un caso en una app y resolverlo en la otra.

Instrucciones exactas en `README.md` y detalle de pruebas en `DOC_DESARROLLO.md`.

## 13. Estado y pendientes manuales

Sistema, base de datos y pruebas automáticas (F2/F3/F7/F8/F9/F10/F11/F12/F13): verificados
funcionando. Pendiente solo lo que requiere interacción: instalación en celular vía Expo Go,
demo en vivo y levantada de Docker (detalles en `README.md`).

## 14. Glosario mínimo

Incidente (reporte de un problema), cola (lista ordenada de casos por atender), prioridad
(urgencia: Baja/Alta/Crítica), SLA (tiempo máximo de respuesta: 4/24/72 h), estado (etapa:
Abierto/En gestión/Pendiente/Escalado/Resuelto/Duplicado/Cerrado), token (pase digital
que identifica la sesión), refresh (pase de 30 días para renovar el token), API (el sistema
central que atiende pedidos de las apps).
