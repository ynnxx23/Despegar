# Datos de acceso — Despegar Grupo 8

Cuentas de demostración de la base (creadas por `db/seed_demo.sql`).
**Son cuentas de prueba con contraseñas públicas: no usar en producción.**

API pública: `https://api-production-88975.up.railway.app/api` (definida en `deploy/api-url.txt`).

## Administradores (pueden registrar agentes y cambiar roles)

| Email | Contraseña | Nombre | Rol |
|---|---|---|---|
| admin@despegar.com | Admin1234 | Laura Admin | admin |
| admin2@despegar.com | Admin5678 | Diego Admin | admin |

Los administradores ven la pestaña **Administrar** dentro de la app del agente
(registrar usuarios, promover a agente, activar/desactivar y ver el historial de cambios).

## Agentes de soporte (app del agente)

| Email | Contraseña | Nombre | Rol |
|---|---|---|---|
| agente@despegar.com | Agente123 | Agente Soporte | agente |
| maria@despegar.com | Agente456 | Maria Agente | agente |
| carlos@despegar.com | Agente789 | Carlos Agente | agente |
| lucia@despegar.com | Agente012 | Lucia Agente | agente |

## Viajeros (app del viajero)

| Email | Contraseña | Nombre | Rol |
|---|---|---|---|
| ana@test.com | Viaje1234 | Ana Viajera | viajero |
| bruno@test.com | Viaje5678 | Bruno Viajero | viajero |
| sofia@test.com | Viaje9012 | Sofia Viajera | viajero |
| diego@test.com | Viaje3456 | Diego Viajero | viajero |
| valeria@test.com | Viaje1122 | Valeria Viajera | viajero |
| tomas@test.com | Viaje3344 | Tomas Viajero | viajero |

## Qué hay en los datos

- 12 usuarios (2 admin, 4 agente, 6 viajeros).
- 10 reservas (vuelos y hoteles) repartidas entre los viajeros.
- 14 incidentes de los 7 tipos, en distintos estados y prioridades:
  - 2 **sin triar** (sin prioridad) esperando en la cola del agente.
  - 4 con **SLA vencido** (aparecen en el contador "Vencidos").
  - Casos asignados a `agente@despegar.com`, `maria@despegar.com`, `carlos@despegar.com` y `lucia@despegar.com`.
  - 2 casos que `lucia@despegar.com` sigue (pestaña "Siguiendo").
- 7 respuestas en los hilos, e historial de gestión (eventos) en los casos trabajados.

## Recargar los datos de demostración

- Base nueva (todo el schema): `psql -U despegar -d despegar -f db/schema.sql -f db/seeds.sql`
- Base existente (solo agrega lo que falta): `psql -U despegar -d despegar -f db/migrate_06_seed_demo_grande.sql`
- En la base de Railway: `powershell -ExecutionPolicy Bypass -File deploy/init-db.ps1 -DatabaseUrl "<url del túnel>"`

Las rutinas son **idempotentes**: correrlas de nuevo no duplica datos.
